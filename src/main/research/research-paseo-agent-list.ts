import { homedir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import type {
  PaseoCompanionAgent,
  PaseoCompanionScope
} from '../../shared/research/research-paseo-companion'

export const AGENT_ID = /^[a-zA-Z0-9_-]{8,128}$/

function normalizeCwd(scope: PaseoCompanionScope, cwd: string): string {
  if (scope.hostId === 'local') {
    return resolve(cwd.startsWith('~/') ? join(homedir(), cwd.slice(2)) : cwd)
  }
  return cwd.replace(/\/+$/, '')
}

function parsePaseoAgents(output: string, scope: PaseoCompanionScope): PaseoCompanionAgent[] {
  const value: unknown = JSON.parse(output)
  if (!Array.isArray(value)) {
    throw new Error('Paseo returned an unsupported agent list.')
  }
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') {
      return []
    }
    if (!('id' in item) || !('cwd' in item)) {
      return []
    }
    if (typeof item.id !== 'string' || !AGENT_ID.test(item.id) || typeof item.cwd !== 'string') {
      return []
    }
    const cwd = normalizeCwd(scope, item.cwd)
    return [
      {
        id: item.id,
        name: 'name' in item && typeof item.name === 'string' ? item.name.slice(0, 200) : item.id,
        provider:
          'provider' in item && typeof item.provider === 'string'
            ? item.provider.slice(0, 100)
            : 'unknown',
        status:
          'status' in item && typeof item.status === 'string'
            ? item.status.slice(0, 40)
            : 'unknown',
        cwd
      }
    ]
  })
}

export function parsePaseoHostAgents(
  output: string,
  scope: PaseoCompanionScope
): PaseoCompanionAgent[] {
  return parsePaseoAgents(output, scope).slice(0, 200)
}

export function parsePaseoProjectAgents(
  output: string,
  scope: PaseoCompanionScope
): PaseoCompanionAgent[] {
  const root = normalizeCwd(scope, scope.workspacePath)
  const prefix = scope.hostId === 'local' ? `${root}${sep}` : `${root}/`
  return parsePaseoAgents(output, scope)
    .filter((agent) => agent.cwd === root || agent.cwd.startsWith(prefix))
    .slice(0, 200)
}
