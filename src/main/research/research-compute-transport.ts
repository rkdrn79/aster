import { Buffer } from 'node:buffer'
import { Readable } from 'node:stream'
import type { SshTarget } from '../../shared/ssh-types'
import type { RemoteInstallTransport } from '../managed-server/install/remote-install-transport'
import {
  execCommand,
  isSshCommandExitError,
  isSshExecTimeout
} from '../ssh/remote-exec/remote-exec-command'
import { spawnSystemSshCommand } from '../ssh/system-transport/system-ssh-command'
import {
  getSshConnectionManager,
  listRegisteredSshTargets
} from '../ssh/targets/ssh-target-registry'

type ComputeTransport = Pick<RemoteInstallTransport, 'exec' | 'usesSystemSshTransport'>

export type ResearchComputeVia = 'connection' | 'system-ssh'

/** One OpenSSH exec per command, reusing Orca's ControlMaster socket between calls. */
function systemSshTransport(target: SshTarget): ComputeTransport {
  return {
    // Why BatchMode: a background read must fail rather than open a password or host-key prompt.
    exec: async (command, options) =>
      spawnSystemSshCommand(target, command, { ...options, nonInteractive: true }),
    usesSystemSshTransport: () => true
  }
}

/** Aster's live connection when it has one; otherwise OpenSSH, only when the caller may dial. */
function computeTransport(
  targetId: string,
  dial: boolean
): { transport: ComputeTransport; via: ResearchComputeVia } | null {
  const connection = getSshConnectionManager()?.getConnection(targetId)
  if (connection?.getState().status === 'connected') {
    return { transport: connection, via: 'connection' }
  }
  const target = dial ? listRegisteredSshTargets().find((entry) => entry.id === targetId) : null
  return target ? { transport: systemSshTransport(target), via: 'system-ssh' } : null
}

export type ResearchComputeCommandResult =
  | { status: 'ok'; via: ResearchComputeVia; stdout: string }
  | { status: 'error'; via: ResearchComputeVia; message: string; output: string | null }
  | { status: 'not-connected' }

// Why: a nonzero exit carries ssh's or the tool's own words; the error message would also repeat
// the whole command, which for the probe is a long script.
function commandFailure(
  command: string,
  error: unknown,
  timeoutMs: number
): { message: string; output: string | null } {
  if (isSshExecTimeout(error)) {
    return { message: `The host did not answer within ${timeoutMs / 1000}s.`, output: null }
  }
  if (!isSshCommandExitError(error)) {
    return { message: error instanceof Error ? error.message : String(error), output: null }
  }
  const prefix = `Command "${command}" failed (exit ${error.exitCode}): `
  const output = error.message.startsWith(prefix) ? error.message.slice(prefix.length).trim() : ''
  const lines = output.split(/\r?\n/).filter((line) => line.trim())
  return {
    message: lines.slice(-3).join(' · ').slice(0, 400) || `The command exited ${error.exitCode}.`,
    output: error.stdout || null
  }
}

export async function runResearchComputeCommand(
  targetId: string,
  dial: boolean,
  command: string,
  timeoutMs: number,
  /** Streamed to the command's stdin, e.g. a file body too large for the command line. */
  stdin?: string
): Promise<ResearchComputeCommandResult> {
  const route = computeTransport(targetId, dial)
  if (!route) {
    return { status: 'not-connected' }
  }
  try {
    const stdout = await execCommand(route.transport, command, {
      timeoutMs,
      ...(stdin === undefined ? {} : { stdin: Readable.from([Buffer.from(stdin, 'utf8')]) })
    })
    return { status: 'ok', via: route.via, stdout }
  } catch (error) {
    return { status: 'error', via: route.via, ...commandFailure(command, error, timeoutMs) }
  }
}
