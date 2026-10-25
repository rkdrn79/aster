import { extractIpcErrorMessage } from '@/lib/ipc-error'

/** An error's readable sentence, without IPC wrappers or an `Error:` prefix. */
export function researchErrorText(cause: unknown): string {
  return extractIpcErrorMessage(cause, String(cause)).replace(/^Error:\s*/, '')
}
