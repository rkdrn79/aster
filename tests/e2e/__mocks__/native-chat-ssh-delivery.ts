import { vi } from 'vitest'
import {
  WRITE_ACCEPTED,
  writeUnverifiable,
  type WriteSettlement
} from '../../../src/shared/pty-write-settlement'
import { createPtyWriteInput } from '../../../src/main/ipc/pty/ipc/write-input'
import type { IPtyProvider } from '../../../src/main/providers/pty-provider-contract'
import type * as PtyProviderRegistry from '../../../src/main/ipc/pty/provider/registry'
import { ptyOwnership } from '../../../src/main/ipc/pty/provider/ownership-state'
import { OrcaRuntimeService } from '../../../src/main/runtime/orca-runtime'
import { makeStore } from '../../../src/main/runtime/runtime-rpc-worktree-store-fixtures'

const io = vi.hoisted(() => ({
  getProvider: (): IPtyProvider => {
    throw new Error('provider not installed')
  },
  rpc: vi.fn()
}))
export { io }
vi.mock('../../../src/main/ipc/pty/provider/registry', async (importOriginal) => {
  const original = await importOriginal<typeof PtyProviderRegistry>()
  return {
    ...original,
    tryGetProviderForPty: () => io.getProvider(),
    getProviderForPty: () => io.getProvider()
  }
})
vi.mock('@/store', () => ({ useAppStore: { getState: () => ({ terminalLayoutsByTabId: {} }) } }))
vi.mock('@/runtime/runtime-rpc-client', () => ({
  callRuntimeRpc: (...args: unknown[]) => io.rpc(...args)
}))
vi.mock('@/runtime/runtime-terminal-stream', () => ({
  getRemoteRuntimePtyEnvironmentId: (id: string) => (id.startsWith('remote:') ? 'owner' : null),
  getRemoteRuntimeTerminalHandle: (id: string) => (id.startsWith('remote:') ? 'terminal' : null),
  getRemoteRuntimePtyOwner: (id: string) =>
    id.startsWith('remote:')
      ? { target: { kind: 'environment', environmentId: 'owner' }, terminal: 'terminal' }
      : null
}))

/** A remote PTY owner whose write acknowledgments settle per `mode`, like a host transport. */
function createSettlingProvider(
  bytes: string[],
  mode: 'accepted' | 'lost' | 'slow'
): IPtyProvider & { hasPty: (id: string) => boolean; dispose: () => void } {
  const timers = new Set<ReturnType<typeof setTimeout>>()
  const settleAfter = (ms: number, settlement: WriteSettlement): Promise<WriteSettlement> =>
    new Promise((resolve) => {
      const timer = setTimeout(() => {
        timers.delete(timer)
        resolve(settlement)
      }, ms)
      timers.add(timer)
    })
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the delivery paths under test touch only these members.
  return {
    hasPty: () => true,
    write: (_id: string, data: string) => {
      bytes.push(data)
      return true
    },
    writeWithSettlement: (_id: string, data: string) => {
      bytes.push(data)
      if (mode === 'lost') {
        return settleAfter(10, writeUnverifiable('transport_settlement_lost', true))
      }
      if (mode === 'slow' && data.startsWith('X')) {
        return settleAfter(1300, WRITE_ACCEPTED)
      }
      return Promise.resolve(WRITE_ACCEPTED)
    },
    dispose: () => {
      for (const timer of timers) {
        clearTimeout(timer)
      }
      timers.clear()
    }
  } as unknown as IPtyProvider & { hasPty: (id: string) => boolean; dispose: () => void }
}

export function createSshDelivery(mode: 'accepted' | 'lost' | 'slow' = 'accepted') {
  const bytes: string[] = []
  const provider = createSettlingProvider(bytes, mode)
  vi.spyOn(provider, 'hasPty').mockReturnValue(true)
  const settlement = vi.spyOn(provider, 'writeWithSettlement')
  io.getProvider = () => provider
  const input = createPtyWriteInput({})
  const id = 'ssh:connection@@pty-1'
  ptyOwnership.set(id, 'connection')
  vi.stubGlobal('window', {
    api: {
      pty: {
        write: (ptyId: string, data: string, inputKind: 'driving') =>
          input.writePtyInput({ id: ptyId, data, inputKind }),
        writeAccepted: (
          ptyId: string,
          data: string,
          inputKind: 'driving',
          options?: { requireWriteSettlement?: true }
        ) => input.writePtyInputAccepted({ id: ptyId, data, inputKind, ...options })
      }
    }
  })
  return {
    id,
    bytes,
    provider,
    settlement,
    close: () => {
      ptyOwnership.delete(id)
      provider.dispose()
    }
  }
}

export async function createPairedRuntime(ssh: ReturnType<typeof createSshDelivery>) {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: This leaf-only fixture uses the existing store stub and never invokes repository mutations.
  const runtime = new OrcaRuntimeService(makeStore() as never)
  runtime.setPtyController({
    write: (_, data) => ssh.provider.write(ssh.id, data),
    writeWithSettlement: (_, data) => ssh.provider.writeWithSettlement(ssh.id, data),
    hasPty: () => true,
    kill: () => true,
    getForegroundProcess: async () => null
  })
  runtime.attachWindow(1)
  runtime.syncWindowGraph(1, {
    tabs: [
      {
        tabId: 'tab-1',
        worktreeId: 'repo-1::/tmp/worktree-a',
        title: 'Codex',
        activeLeafId: '11111111-1111-4111-8111-111111111111',
        layout: null
      }
    ],
    leaves: [
      {
        tabId: 'tab-1',
        worktreeId: 'repo-1::/tmp/worktree-a',
        leafId: '11111111-1111-4111-8111-111111111111',
        paneRuntimeId: 1,
        ptyId: ssh.id,
        paneTitle: null,
        title: ''
      }
    ]
  })
  const { terminals } = await runtime.listTerminals('id:repo-1::/tmp/worktree-a')
  if (!terminals[0]) {
    throw new Error('terminal fixture missing')
  }
  return { runtime, handle: terminals[0].handle }
}
