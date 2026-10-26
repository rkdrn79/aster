import { z } from 'zod'
import type { ResearchHostToolsStatus } from '../../shared/research-host-tools-status'
import { resolveEnvironment } from '../../shared/runtime-environment-store'
import { getCanonicalUserDataPath } from '../persistence/loading-store/user-data-path'
import { knownSshHostPlatform } from '../ssh/ssh-host-platform-memo'
import { listRegisteredSshTargets } from '../ssh/targets/ssh-target-registry'
import { runResearchSshCli } from './research-ssh-cli'

const schema = z
  .object({
    state: z.enum(['preparing', 'ready', 'error']),
    node: z.boolean(),
    npm: z.boolean(),
    pdf: z.boolean(),
    detail: z.string().nullable()
  })
  .strict()
const current = new Map<string, ResearchHostToolsStatus>()
const inFlight = new Map<string, Promise<void>>()

function runtimeId(targetId: string): string | null {
  const target = listRegisteredSshTargets().find((item) => item.id === targetId)
  const environmentId = target?.orcadFence?.environmentId
  if (!environmentId) {
    return null
  }
  try {
    return resolveEnvironment(getCanonicalUserDataPath(), environmentId).runtimeId ?? null
  } catch {
    return null
  }
}

export function beginResearchSshToolPreparation(targetId: string): void {
  if (inFlight.has(targetId)) {
    return
  }
  const platform = knownSshHostPlatform(targetId)
  if (platform?.os === 'win32') {
    current.set(targetId, {
      state: 'error',
      node: false,
      npm: false,
      pdf: false,
      detail:
        'Automatic research tools require a macOS or Linux managed Aster runtime on this SSH host.'
    })
    return
  }
  const expected = runtimeId(targetId)
  if (!expected) {
    return
  }
  current.set(targetId, { state: 'preparing', node: true, npm: false, pdf: false, detail: null })
  const work = (async () => {
    try {
      const result = await runResearchSshCli({
        targetId,
        runtimeId: expected,
        args: ['research', 'host', 'prepare'],
        timeoutMs: 8 * 60_000
      })
      current.set(targetId, schema.parse(result))
    } catch (error) {
      current.set(targetId, {
        state: 'error',
        node: true,
        npm: false,
        pdf: false,
        detail: error instanceof Error ? error.message : String(error)
      })
    }
  })()
  inFlight.set(targetId, work)
  void work.finally(() => inFlight.delete(targetId))
}

export async function getResearchSshToolStatus(targetId: string): Promise<ResearchHostToolsStatus> {
  if (!current.has(targetId)) {
    beginResearchSshToolPreparation(targetId)
  }
  const pending = current.get(targetId)
  if (inFlight.has(targetId) && pending) {
    return pending
  }
  const expected = runtimeId(targetId)
  if (!expected) {
    return (
      pending ?? {
        state: 'error',
        node: false,
        npm: false,
        pdf: false,
        detail: 'Connect this SSH host to prepare research tools.'
      }
    )
  }
  try {
    const result = schema.parse(
      await runResearchSshCli({
        targetId,
        runtimeId: expected,
        args: ['research', 'host', 'tools']
      })
    )
    current.set(targetId, result)
    return result
  } catch (error) {
    return (
      pending ?? {
        state: 'error',
        node: true,
        npm: false,
        pdf: false,
        detail: error instanceof Error ? error.message : String(error)
      }
    )
  }
}
