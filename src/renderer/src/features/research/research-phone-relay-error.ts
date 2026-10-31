import { RuntimeRpcCallError } from '@/runtime/runtime-rpc-result'
import { researchErrorText } from './research-error-text'

/** A host that predates a phone access method answers with an unknown-method error. */
export function phoneRelayErrorText(cause: unknown): string {
  const oldHost =
    (cause instanceof RuntimeRpcCallError && cause.code === 'method_not_found') ||
    /unknown method|method_not_found/i.test(String(cause))
  return oldHost
    ? 'This server runs an older Aster. Update it under Settings → SSH, then try again.'
    : researchErrorText(cause)
}
