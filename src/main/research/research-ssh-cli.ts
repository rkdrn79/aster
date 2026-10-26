import { quotePosixShell } from '../../shared/shell-argument-quoting'
import { runResearchComputeCommand } from './research-compute-transport'

const START = '__ASTER_SSH_CLI_BEGIN__'
const END = '__ASTER_SSH_CLI_END__'
const known = new Map<string, { runtimeId: string; path: string }>()

function runtimeIdFromStatus(raw: string): string | null {
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object') {
      return null
    }
    const result = Reflect.get(value, 'result')
    const runtime = result && typeof result === 'object' ? Reflect.get(result, 'runtime') : null
    const runtimeId =
      runtime && typeof runtime === 'object' ? Reflect.get(runtime, 'runtimeId') : null
    return typeof runtimeId === 'string' ? runtimeId : null
  } catch {
    return null
  }
}

/** Finds the profile CLI belonging to the runtime this SSH project was paired with. */
export async function findResearchSshCli(targetId: string, runtimeId: string): Promise<string> {
  const cached = known.get(targetId)
  if (cached?.runtimeId === runtimeId) {
    return cached.path
  }
  const command = [
    'for candidate in "$HOME/.orca/cli/bin/aster" "$HOME"/.orca-*/cli/bin/aster "${XDG_DATA_HOME:-$HOME/.local/share}/Orca/cli/bin/aster";',
    'do [ -x "$candidate" ] || continue;',
    `printf '${START}%s\\n' "$candidate";`,
    '"$candidate" status --json || true;',
    `printf '${END}\\n';`,
    'done'
  ].join(' ')
  const result = await runResearchComputeCommand(targetId, true, command, 30_000)
  if (result.status !== 'ok') {
    throw new Error(
      result.status === 'not-connected'
        ? 'Connect the SSH host before setting up Slack.'
        : `Could not inspect Aster on the SSH host: ${result.message}`
    )
  }
  for (const section of result.stdout.split(START).slice(1)) {
    const end = section.indexOf(END)
    if (end === -1) {
      continue
    }
    const newline = section.indexOf('\n')
    if (newline === -1 || newline > end) {
      continue
    }
    const path = section.slice(0, newline).trim()
    if (
      path.startsWith('/') &&
      runtimeIdFromStatus(section.slice(newline + 1, end).trim()) === runtimeId
    ) {
      known.set(targetId, { runtimeId, path })
      return path
    }
  }
  throw new Error('Aster on this SSH host is not ready. Reconnect the host, then try again.')
}

export async function runResearchSshCli(input: {
  targetId: string
  runtimeId: string
  args: readonly string[]
  stdin?: string
  timeoutMs?: number
}): Promise<unknown> {
  const path = await findResearchSshCli(input.targetId, input.runtimeId)
  const command = [path, ...input.args].map(quotePosixShell).join(' ')
  const result = await runResearchComputeCommand(
    input.targetId,
    true,
    command,
    input.timeoutMs ?? 30_000,
    input.stdin
  )
  if (result.status !== 'ok') {
    known.delete(input.targetId)
    throw new Error(
      result.status === 'not-connected' ? 'The SSH host is unavailable.' : result.message
    )
  }
  let value: unknown
  try {
    value = JSON.parse(result.stdout)
  } catch {
    throw new Error('Aster on the SSH host returned an unreadable response')
  }
  if (!value || typeof value !== 'object' || Reflect.get(value, 'ok') !== true) {
    throw new Error('Aster on the SSH host refused the request')
  }
  return Reflect.get(value, 'result')
}
