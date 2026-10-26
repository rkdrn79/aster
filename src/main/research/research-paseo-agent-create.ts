import { quotePosixShell } from '../../shared/shell-argument-quoting'
import type {
  PaseoCompanionProvider,
  PaseoCompanionScope
} from '../../shared/research/research-paseo-companion'
import { runResearchComputeCommand } from './research-compute-transport'
import {
  AGENT_ID,
  CLI_TIMEOUT_MS,
  REMOTE_CLI_RESOLVE,
  callWithDaemon,
  remoteTargetId
} from './research-paseo-companion'

const PROVIDER_ID = /^[a-z][a-z0-9-]{0,49}$/
const REMOTE_RUN_AGENT = `${REMOTE_CLI_RESOLVE}
prompt=$(cat)
if [ -z "$prompt" ]; then echo EMPTY_PROMPT >&2; exit 2; fi
exec "$paseo_bin" agent run "$prompt" --cwd "$1" --provider "$2" --background --json`

export async function listPaseoProjectProviders(
  scope: PaseoCompanionScope
): Promise<PaseoCompanionProvider[]> {
  const value: unknown = JSON.parse(await callWithDaemon(scope, ['provider', 'ls', '--json']))
  if (!Array.isArray(value)) {
    throw new Error('Paseo returned an unsupported provider list.')
  }
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || !('provider' in item)) {
      return []
    }
    if (
      typeof item.provider !== 'string' ||
      !PROVIDER_ID.test(item.provider) ||
      !('status' in item) ||
      item.status !== 'available' ||
      ('enabled' in item && item.enabled === false)
    ) {
      return []
    }
    return [
      {
        id: item.provider,
        label:
          'label' in item && typeof item.label === 'string'
            ? item.label.slice(0, 100)
            : item.provider
      }
    ]
  })
}

/** A new phone-visible conversation starts only from an explicit user request. */
export async function startPaseoProjectAgent(
  scope: PaseoCompanionScope,
  prompt: string,
  provider: string
): Promise<string> {
  if (!prompt.trim() || prompt.length > 20_000) {
    throw new Error('Enter a first message under 20,000 characters.')
  }
  if (
    !PROVIDER_ID.test(provider) ||
    !(await listPaseoProjectProviders(scope)).some((entry) => entry.id === provider)
  ) {
    throw new Error('Choose an available Paseo agent on this host.')
  }
  let output: string
  if (scope.hostId === 'local') {
    output = await callWithDaemon(scope, [
      'agent',
      'run',
      prompt,
      '--cwd',
      scope.workspacePath,
      '--provider',
      provider,
      '--background',
      '--json'
    ])
  } else {
    if (!scope.workspacePath.startsWith('/')) {
      throw new Error('Phone chats currently require a macOS or Linux SSH host.')
    }
    const targetId = remoteTargetId(scope.hostId)
    if (!targetId) {
      throw new Error('This project is not linked to an SSH host in Aster.')
    }
    const command = `sh -c ${quotePosixShell(REMOTE_RUN_AGENT)} paseo ${quotePosixShell(scope.workspacePath)} ${quotePosixShell(provider)}`
    const result = await runResearchComputeCommand(targetId, true, command, CLI_TIMEOUT_MS, prompt)
    if (result.status !== 'ok') {
      throw new Error(
        result.status === 'not-connected' ? 'The SSH host is unavailable.' : result.message
      )
    }
    output = result.stdout
  }
  let value: unknown
  try {
    value = JSON.parse(output)
  } catch {
    throw new Error('Paseo did not return the new conversation ID.')
  }
  if (
    !value ||
    typeof value !== 'object' ||
    !('agentId' in value) ||
    typeof value.agentId !== 'string' ||
    !AGENT_ID.test(value.agentId)
  ) {
    throw new Error('Paseo did not return the new conversation ID.')
  }
  return value.agentId
}
