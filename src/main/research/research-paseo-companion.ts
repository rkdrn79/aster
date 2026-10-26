import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { accessSync, constants } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { runProcess } from '@orca/process-host'
import { resolveExecutableCommand } from '../../shared/node-cli-command-resolution'
import { parseHostAuthorityKey } from '../../shared/host-authority'
import { parseExecutionHostId } from '../../shared/execution-host'
import { quotePosixShell } from '../../shared/shell-argument-quoting'
import { listRegisteredSshTargets } from '../ssh/targets/ssh-target-registry'
import { runResearchComputeCommand } from './research-compute-transport'
import type {
  PaseoCompanionAgent,
  PaseoCompanionScope
} from '../../shared/research/research-paseo-companion'

const MAX_OUTPUT_BYTES = 256 * 1024
export const CLI_TIMEOUT_MS = 20_000
export const AGENT_ID = /^[a-zA-Z0-9_-]{8,128}$/
const PASEO_PACKAGE = '@getpaseo/cli@0.12.0'

export const REMOTE_CLI_RESOLVE = `paseo_bin=$(command -v paseo 2>/dev/null || true)
if [ -z "$paseo_bin" ]; then
  for candidate in "$HOME"/.local/aster-paseo/node_modules/.bin/paseo "$HOME"/.local/paseo-*/bin/paseo "$HOME"/.local/bin/paseo "$HOME"/.npm-global/bin/paseo; do
    if [ -x "$candidate" ]; then paseo_bin=$candidate; break; fi
  done
fi
if [ -z "$paseo_bin" ]; then echo PASEO_CLI_MISSING >&2; exit 127; fi`
const REMOTE_CLI = `${REMOTE_CLI_RESOLVE}
exec "$paseo_bin" "$@"`

function localPaseoCommand(): string | null {
  const installed = resolveExecutableCommand('paseo')
  if (installed) {
    return installed
  }
  if (process.platform !== 'darwin') {
    return null
  }
  for (const candidate of [
    '/Applications/Paseo.app/Contents/Resources/bin/paseo',
    join(homedir(), 'Applications/Paseo.app/Contents/Resources/bin/paseo')
  ]) {
    try {
      accessSync(candidate, constants.X_OK)
      return candidate
    } catch {
      continue
    }
  }
  return null
}

export function remoteTargetId(hostId: string): string | null {
  const authority = parseHostAuthorityKey(hostId)
  if (!authority) {
    return null
  }
  if (authority.endpoint.kind === 'self') {
    const host = parseExecutionHostId(authority.at)
    return host?.kind === 'ssh' ? host.targetId : null
  }
  if (authority.at !== 'local') {
    return null
  }
  const environmentId = authority.endpoint.environmentId
  return (
    listRegisteredSshTargets().find((target) => target.orcadFence?.environmentId === environmentId)
      ?.id ?? null
  )
}

async function callPaseo(
  scope: PaseoCompanionScope,
  args: string[],
  stdin?: string
): Promise<string> {
  if (scope.hostId === 'local') {
    const program = localPaseoCommand()
    if (!program) {
      throw new Error('Paseo is not installed on this computer.')
    }
    const result = await runProcess({
      program,
      args,
      timeoutMs: CLI_TIMEOUT_MS,
      maxOutputBytes: MAX_OUTPUT_BYTES,
      killOnOutputLimit: true,
      env: process.env
    })
    if (result.timedOut || result.outputTruncated) {
      throw new Error('Paseo did not answer within the limit.')
    }
    if (result.code !== 0) {
      throw new Error(result.stderr.trim().slice(-400) || 'Paseo could not answer.')
    }
    return result.stdout
  }
  if (!scope.workspacePath.startsWith('/')) {
    throw new Error('Phone chats currently require a macOS or Linux SSH host.')
  }
  const targetId = remoteTargetId(scope.hostId)
  if (!targetId) {
    throw new Error('This project is not linked to an SSH host in Aster.')
  }
  const command = `sh -c ${quotePosixShell(REMOTE_CLI)} paseo ${args.map(quotePosixShell).join(' ')}`
  const result = await runResearchComputeCommand(targetId, true, command, CLI_TIMEOUT_MS, stdin)
  if (result.status === 'not-connected') {
    throw new Error('The SSH host is unavailable.')
  }
  if (result.status === 'error') {
    throw new Error(
      result.message.includes('PASEO_CLI_MISSING')
        ? 'Paseo is not installed on this server.'
        : result.message
    )
  }
  if (Buffer.byteLength(result.stdout) > MAX_OUTPUT_BYTES) {
    throw new Error('Paseo response is too large.')
  }
  return result.stdout
}

function normalizeCwd(scope: PaseoCompanionScope, cwd: string): string {
  if (scope.hostId === 'local') {
    return resolve(cwd.startsWith('~/') ? join(homedir(), cwd.slice(2)) : cwd)
  }
  return cwd.replace(/\/+$/, '')
}

export function parsePaseoProjectAgents(
  output: string,
  scope: PaseoCompanionScope
): PaseoCompanionAgent[] {
  const value: unknown = JSON.parse(output)
  if (!Array.isArray(value)) {
    throw new Error('Paseo returned an unsupported agent list.')
  }
  const root = normalizeCwd(scope, scope.workspacePath)
  return value
    .flatMap((item) => {
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
      const prefix = scope.hostId === 'local' ? `${root}${sep}` : `${root}/`
      if (cwd !== root && !cwd.startsWith(prefix)) {
        return []
      }
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
    .slice(0, 200)
}

export async function listPaseoProjectAgents(
  scope: PaseoCompanionScope
): Promise<PaseoCompanionAgent[]> {
  return parsePaseoProjectAgents(await callWithDaemon(scope, ['ls', '--json']), scope)
}

export async function setUpPaseoProjectDaemon(scope: PaseoCompanionScope): Promise<void> {
  if (scope.hostId === 'local') {
    throw new Error('Install the Paseo desktop app on this computer to use phone chats.')
  }
  if (!scope.workspacePath.startsWith('/')) {
    throw new Error('Phone chats currently require a macOS or Linux SSH host.')
  }
  try {
    await callPaseo(scope, ['daemon', 'start', '--timeout', '15'])
    return
  } catch (cause) {
    if (!String(cause).includes('Paseo is not installed on this server.')) {
      throw cause
    }
  }
  const targetId = remoteTargetId(scope.hostId)
  if (!targetId) {
    throw new Error('This project is not linked to an SSH host in Aster.')
  }
  const command = `command -v npm >/dev/null 2>&1 || { echo NPM_MISSING >&2; exit 127; }; npm install --prefix "$HOME/.local/aster-paseo" --no-audit --no-fund --silent ${quotePosixShell(PASEO_PACKAGE)}`
  const result = await runResearchComputeCommand(targetId, true, command, 120_000)
  if (result.status !== 'ok') {
    throw new Error(
      result.status === 'not-connected'
        ? 'The SSH host is unavailable.'
        : result.message.includes('NPM_MISSING')
          ? 'Node.js and npm are required to set up Paseo on this server.'
          : `Paseo setup failed: ${result.message}`
    )
  }
  await callPaseo(scope, ['daemon', 'start', '--timeout', '15'])
}

export async function callWithDaemon(scope: PaseoCompanionScope, args: string[]): Promise<string> {
  try {
    return await callPaseo(scope, args)
  } catch (cause) {
    if (
      !String(cause).includes('DAEMON_UNREACHABLE') &&
      !String(cause).includes('Cannot connect to daemon at')
    ) {
      throw cause
    }
    await callPaseo(scope, ['daemon', 'start', '--timeout', '15'])
    return callPaseo(scope, args)
  }
}

async function assertProjectAgent(scope: PaseoCompanionScope, agentId: string): Promise<void> {
  if (!AGENT_ID.test(agentId)) {
    throw new Error('Invalid Paseo agent ID.')
  }
  if (!(await listPaseoProjectAgents(scope)).some((agent) => agent.id === agentId)) {
    throw new Error('This Paseo agent is not in the selected project.')
  }
}

export async function readPaseoProjectAgentLog(
  scope: PaseoCompanionScope,
  agentId: string
): Promise<string> {
  await assertProjectAgent(scope, agentId)
  return (await callPaseo(scope, ['logs', agentId, '--tail', '30', '--no-color'])).slice(-64_000)
}

export async function getPaseoPhonePairingUrl(scope: PaseoCompanionScope): Promise<string> {
  const output = await callWithDaemon(scope, ['daemon', 'pair', '--relay', '--json'])
  let value: unknown
  try {
    value = JSON.parse(output)
  } catch {
    throw new Error('Paseo did not return a phone pairing link.')
  }
  if (
    !value ||
    typeof value !== 'object' ||
    !('url' in value) ||
    typeof value.url !== 'string' ||
    value.url.length < 10 ||
    value.url.length > 4096
  ) {
    throw new Error('Paseo did not return a phone pairing link.')
  }
  return value.url
}

export async function sendPaseoProjectAgentMessage(
  scope: PaseoCompanionScope,
  agentId: string,
  message: string
): Promise<void> {
  if (!message.trim() || message.length > 20_000) {
    throw new Error('Enter a message under 20,000 characters.')
  }
  await assertProjectAgent(scope, agentId)
  if (scope.hostId !== 'local') {
    await callPaseo(
      scope,
      ['send', agentId, '--prompt-file', '/dev/stdin', '--no-wait', '--json'],
      message
    )
    return
  }
  const dir = await mkdtemp(join(tmpdir(), 'aster-paseo-'))
  try {
    const file = join(dir, 'prompt.txt')
    await writeFile(file, message, { mode: 0o600 })
    await callPaseo(scope, ['send', agentId, '--prompt-file', file, '--no-wait', '--json'])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
