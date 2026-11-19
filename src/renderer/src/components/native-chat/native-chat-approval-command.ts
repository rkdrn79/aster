/** Keys a shell call's input may carry beside the command without the card losing anything:
 *  the description is already the card's own line when the two match. */
const SHELL_INPUT_KEYS = new Set(['command', 'description'])

/**
 * The command line an approval's detail stands for, when the detail is a shell call's input
 * (`{ "command": "…", "description": "…" }`) whose description, if any, the card already shows.
 * Null for anything else, which keeps its detail as written.
 */
export function nativeChatApprovalCommandLine(
  detail: string | undefined,
  description: string | undefined
): string | null {
  if (!detail || !detail.trimStart().startsWith('{')) {
    return null
  }
  let input: unknown
  try {
    input = JSON.parse(detail)
  } catch {
    return null
  }
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return null
  }
  if (!Object.keys(input).every((key) => SHELL_INPUT_KEYS.has(key))) {
    return null
  }
  const command: unknown = Reflect.get(input, 'command')
  const inputDescription: unknown = Reflect.get(input, 'description')
  if (typeof command !== 'string' || command.trim() === '') {
    return null
  }
  if (inputDescription !== undefined && inputDescription !== description) {
    return null
  }
  return command
}
