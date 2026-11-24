import { hostname } from 'node:os'
import { LOCAL_EXECUTION_HOST_ID } from '../../shared/execution-host'
import { listRegisteredSshTargets } from '../ssh/targets/ssh-target-registry'
import { readResearchGpuPolicySource } from './research-gpu-host-policy'

export const GPU_LIMITS_WHERE = 'Set limits in Aster → Compute → GPU allocation.'

export type ResearchGpuServer = { id: string; label: string }

function same(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase()
}

async function localNames(): Promise<{ label: string; names: string[] }> {
  const source = await readResearchGpuPolicySource().catch(() => null)
  const name = hostname()
  return {
    label: source?.label ?? name,
    names: [
      'local',
      'localhost',
      name,
      name.split('.')[0],
      ...(source?.label ? [source.label] : [])
    ]
  }
}

/**
 * This server itself, when the runtime is orcad on an SSH host: there the desktop's limits for it
 * are stored as `local`. Agents may name it `local`, by its hostname or by its name in Aster.
 */
export async function localGpuServer(query?: string): Promise<ResearchGpuServer | undefined> {
  // Why: only orcad (plain Node, no SSH hosts of its own) is the host it schedules on.
  if (process.versions.electron || listRegisteredSshTargets().length) {
    return undefined
  }
  const { label, names } = await localNames()
  if (query !== undefined && !names.some((name) => same(name, query))) {
    return undefined
  }
  return { id: LOCAL_EXECUTION_HOST_ID, label }
}

export async function missingGpuServerMessage(query: string): Promise<string> {
  if (!process.versions.electron && !listRegisteredSshTargets().length) {
    const { label } = await localNames()
    return `"${query}" is not this server. On ${label}, pass --server local (or ${label}).`
  }
  return `No SSH host named "${query}". Use the label shown in Aster → Compute.`
}
