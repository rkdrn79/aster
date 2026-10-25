import { RuntimeClientError } from './types'
import { CLI_NAME, PRODUCT_NAME } from '../../shared/product-brand'

export const MAC_CRASH_REPORT_GLOB = `~/Library/Logs/DiagnosticReports/${PRODUCT_NAME}-*.ips`

/** A darwin SIGABRT of the serve child: the startup-registration abort a retry cannot fix. */
export class MacServeStartupAbortError extends RuntimeClientError {}

export function serveSignalExitError(
  signal: NodeJS.Signals | null,
  platform: NodeJS.Platform = process.platform
): RuntimeClientError {
  if (!signal) {
    return new RuntimeClientError(
      'runtime_serve_failed',
      `${PRODUCT_NAME} serve exited without reporting an exit code or signal.`
    )
  }
  if (platform !== 'darwin' || signal !== 'SIGABRT') {
    return new RuntimeClientError(
      'runtime_serve_failed',
      `${PRODUCT_NAME} serve exited via ${signal}.`
    )
  }
  // Why: the startup abort happens inside +[NSApplication sharedApplication], before any of our JS
  // runs, so the parent CLI is the only place it can be explained. We only see the signal, never the
  // phase, so the cause is offered as the likely one rather than asserted.
  return new MacServeStartupAbortError(
    'runtime_serve_failed',
    `${PRODUCT_NAME} serve aborted with SIGABRT on macOS. This most often happens at application startup, when the process cannot register with Launch Services (_RegisterApplication / +[NSApplication sharedApplication]) before any ${PRODUCT_NAME} JavaScript runs. That is common in sandboxed agent environments, SSH sessions without a GUI login, and CI. Confirm the crashing frame in the crash report; this is not the Electron UTF-8 write abort (electron/electron#51871).`,
    {
      nextSteps: [
        `If a desktop ${PRODUCT_NAME} is already running, use \`${CLI_NAME} status\` / \`${CLI_NAME}\` against that instance instead of \`${CLI_NAME} serve\`.`,
        `Re-run \`${CLI_NAME} serve\` outside a sandboxed or restricted environment, with a macOS desktop login active. Later \`${CLI_NAME} serve\` runs from this same environment refuse for 30 minutes; pass --force to try anyway.`,
        `Look for a crash report at ${MAC_CRASH_REPORT_GLOB}. If the crashing frame is _RegisterApplication, this is the startup-registration abort.`
      ]
    }
  )
}
