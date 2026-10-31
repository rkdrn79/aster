import { describe, expect, it } from 'vitest'
import { callerScopeOf } from '../device-principal'
import { OrcaRuntimeService } from '../orca-runtime'
import type { RpcRequest, RpcResponse } from './core'
import { RpcDispatcher } from './dispatcher'
import { ALL_RPC_METHODS } from './methods'
import type { RpcCallerScope } from './rpc-caller-scope'
import { RPC_METHOD_PERMISSIONS } from './rpc-method-permission'

const PAIRED: RpcCallerScope = { kind: 'runtime-paired', grants: [] }

function request(method: string, params?: unknown): RpcRequest {
  return { id: `req-${method}`, authToken: 'unused', method, params }
}

async function dispatchAs(
  scope: RpcCallerScope | undefined,
  method: string,
  params?: unknown,
  runtime = new OrcaRuntimeService()
): Promise<RpcResponse> {
  return new RpcDispatcher({ runtime }).dispatch(
    request(method, params),
    scope ? { callerScope: scope } : undefined
  )
}

function errorCode(response: RpcResponse): string | null {
  return response.ok ? null : response.error.code
}

describe('every RPC method declares a known permission', () => {
  it('rejects nothing outside the permission vocabulary', () => {
    for (const method of ALL_RPC_METHODS) {
      expect(RPC_METHOD_PERMISSIONS, method.name).toContain(method.permission)
    }
  })

  it('classifies desktop control and owner administration as non-workspace', () => {
    const permissionOf = (name: string) => ALL_RPC_METHODS.find((m) => m.name === name)?.permission
    expect(permissionOf('computer.click')).toBe('desktop-control')
    expect(permissionOf('computer.typeText')).toBe('desktop-control')
    expect(permissionOf('computer.permissionsStatus')).toBe('workspace')
    expect(permissionOf('accounts.selectClaude')).toBe('accounts-admin')
    expect(permissionOf('settings.update')).toBe('settings-write')
    expect(permissionOf('settings.getAgentLaunch')).toBe('workspace')
    expect(permissionOf('settings.mutateAgentLaunch')).toBe('settings-write')
    expect(permissionOf('skills.install')).toBe('skills-admin')
    expect(permissionOf('skills.share')).toBe('skills-admin')
    expect(permissionOf('pairing.provisionRelay')).toBe('pairing-admin')
    expect(permissionOf('ssh.connect')).toBe('host-admin')
    expect(permissionOf('network.browserTunnel')).toBe('host-admin')
  })
})

describe('paired runtime clients', () => {
  it('cannot drive the desktop without a pairing-time grant', async () => {
    const response = await dispatchAs(PAIRED, 'computer.click', { app: 'Finder' })
    expect(errorCode(response)).toBe('forbidden')
  })

  it('may drive the desktop when the pairing granted it', async () => {
    const response = await dispatchAs(
      { kind: 'runtime-paired', grants: ['desktop-control'] },
      'computer.click',
      {}
    )
    expect(errorCode(response)).not.toBe('forbidden')
  })

  it.each(['settings.update', 'accounts.selectClaude', 'skills.install', 'updater.check'])(
    'keep the remote UI surface: %s',
    async (method) => {
      const response = await dispatchAs(PAIRED, method, {})
      expect(errorCode(response)).not.toBe('forbidden')
    }
  )

  it.each(['pairing.provisionRelay', 'pairing.getEndpoints', 'notifications.registerPush'])(
    'are refused pairing and push administration: %s',
    async (method) => {
      const response = await dispatchAs(PAIRED, method, {})
      expect(errorCode(response)).toBe('forbidden')
    }
  )

  it('learn an unregistered method is missing rather than forbidden', async () => {
    const response = await dispatchAs(PAIRED, 'computer.methodFromTheFuture', {})
    expect(errorCode(response)).toBe('method_not_found')
  })
})

describe('a phone paired through phone access', () => {
  const link = {
    deviceId: 'link',
    name: 'Phone 10/30/2026',
    token: 'token',
    scope: 'runtime',
    pairedAt: 1,
    lastSeenAt: 2,
    pairingOrigin: 'phone-access'
  } as const
  const installation = {
    ...link,
    deviceId: 'installation',
    token: undefined,
    credentialKind: 'device-key',
    forkedFrom: 'link'
  } as const

  it.each([
    ['phoneRelay.configure', { relayUrl: 'wss://attacker.example/ws' }],
    ['phoneRelay.pair', {}],
    ['phoneRelay.devices', undefined],
    ['phoneRelay.revoke', { deviceId: 'other-phone' }],
    ['phoneRelay.status', undefined]
  ])('cannot manage phone access: %s', async (method, params) => {
    for (const device of [link, installation]) {
      const response = await dispatchAs(callerScopeOf(device), method, params)
      expect(errorCode(response), device.deviceId).toBe('forbidden')
    }
  })

  it('keeps its own notifications and the workspace', async () => {
    const scope = callerScopeOf(installation)
    expect(errorCode(await dispatchAs(scope, 'phoneNotify.vapidKey'))).not.toBe('forbidden')
    expect(errorCode(await dispatchAs(scope, 'updater.check', {}))).not.toBe('forbidden')
  })

  it('leaves the managing desktop able to manage phone access', async () => {
    const desktop = callerScopeOf({ ...link, name: 'CLI 10/30/2026', pairingOrigin: undefined })
    const response = await dispatchAs(desktop, 'phoneRelay.status')
    expect(errorCode(response)).not.toBe('forbidden')
  })
})

describe('the owner', () => {
  it('reaches desktop control unscoped', async () => {
    const response = await dispatchAs(undefined, 'computer.click', {})
    expect(errorCode(response)).not.toBe('forbidden')
  })
})

describe('a pinned in-process bridge dispatcher', () => {
  it('ignores a wider per-call scope', async () => {
    const dispatcher = new RpcDispatcher({
      runtime: new OrcaRuntimeService(),
      callerScope: PAIRED
    })
    const response = await dispatcher.dispatch(request('computer.click', { app: 'Finder' }), {
      callerScope: { kind: 'owner' }
    })
    expect(errorCode(response)).toBe('forbidden')
  })
})
