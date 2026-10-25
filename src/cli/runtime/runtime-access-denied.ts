import { RuntimeClientError } from './types'
import { isProcessRunning } from './runtime-pid-liveness'
import { CLI_NAME, PRODUCT_NAME } from '../../shared/product-brand'

// Why: the errno decides the classification; CODEX_SANDBOX only picks the wording.
export function runtimeAccessDeniedError(
  socketError: Error,
  pid: number
): RuntimeClientError | null {
  const systemCode = 'code' in socketError ? socketError.code : undefined
  // Why: a sandbox still sees ESRCH, so a dead Orca's leftover socket gets not-running advice.
  if ((systemCode !== 'EPERM' && systemCode !== 'EACCES') || !isProcessRunning(pid)) {
    return null
  }
  const codexSandbox = Boolean(process.env.CODEX_SANDBOX)
  const message = codexSandbox
    ? `The Codex sandbox blocked this command from connecting to ${PRODUCT_NAME} (${systemCode}). ${PRODUCT_NAME} may be running normally.`
    : `Permission denied connecting to ${PRODUCT_NAME} (${systemCode}). ${PRODUCT_NAME} may be running normally; this command's sandbox or OS permissions block the connection.`
  const retryStep = codexSandbox
    ? 'Re-run this command with escalated permissions, outside the Codex sandbox.'
    : `Re-run this command outside its sandbox, or as a user allowed to reach the ${PRODUCT_NAME} runtime.`
  return new RuntimeClientError('runtime_access_denied', message, {
    systemCode,
    nextSteps: [
      retryStep,
      `Do not restart ${PRODUCT_NAME} or run '${CLI_NAME} open'; a restart cannot grant this command access.`
    ]
  })
}
