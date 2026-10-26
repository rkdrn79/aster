import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveEnvironment } from './runtime-environment-store'
import { createEnvironmentFromPairingOffer } from './runtime-environments'
import { PAIRING_OFFER_VERSION } from './pairing'
import { assertSlackRouteHost, slackHostKeyFingerprint } from './slack-project-route-host'

vi.mock('./runtime-environment-store', () => ({ resolveEnvironment: vi.fn() }))

const key = Buffer.alloc(32, 7).toString('base64')
const route = {
  environmentId: 'vip',
  executionHostId: 'runtime:vip',
  hostKeyFingerprint: slackHostKeyFingerprint(key),
  runtimeId: 'runtime-1'
}

function environment(publicKeyB64: string, runtimeId: string) {
  return createEnvironmentFromPairingOffer({
    id: 'vip',
    name: 'VIP',
    now: 1,
    runtimeId,
    offer: {
      v: PAIRING_OFFER_VERSION,
      endpoint: 'ws://127.0.0.1:1234',
      deviceToken: 'test-token',
      publicKeyB64
    }
  })
}

beforeEach(() => {
  vi.mocked(resolveEnvironment).mockReturnValue(environment(key, 'runtime-1'))
})

describe('remote Slack host fence', () => {
  it('allows only the pinned paired host and runtime', () => {
    expect(assertSlackRouteHost('/profile', route)).toBe('vip')
    expect(resolveEnvironment).toHaveBeenCalledWith('/profile', 'vip')
  })

  it('refuses a re-paired host or changed runtime before delivery', () => {
    vi.mocked(resolveEnvironment).mockReturnValue(
      environment(Buffer.alloc(32, 8).toString('base64'), 'runtime-1')
    )
    expect(() => assertSlackRouteHost('/profile', route)).toThrow('identity changed')
    vi.mocked(resolveEnvironment).mockReturnValue(environment(key, 'runtime-2'))
    expect(() => assertSlackRouteHost('/profile', route)).toThrow('identity changed')
  })

  it('never routes a remote binding without a paired environment as local', () => {
    expect(() => assertSlackRouteHost('/profile', { executionHostId: 'runtime:vip' })).toThrow(
      'no paired runtime'
    )
  })
})
