/**
 * Machine context Aster attaches to a short human request: a fenced block with the info string
 * `aster-context <label>`. The agent reads all of it; Aster's chat shows the request and folds the
 * block into a chip, and an older client still renders it as a readable code block.
 */
export const ASTER_CONTEXT_INFO = 'aster-context'

export type AsterContext = { label: string; body: string }

export type AsterContextMessage = {
  /** The text outside every context block, trimmed: what the person asked. */
  request: string
  contexts: AsterContext[]
}

const LABEL_LIMIT = 120
const OPENING = /^(`{3,})aster-context(?:[ \t]+(.*?))?[ \t]*$/

function contextLabel(label: string): string {
  return label
    .replace(/[`\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, LABEL_LIMIT)
}

/** The block alone; its fence outgrows any backtick run inside so the body cannot close it. */
export function asterContextBlock(context: AsterContext): string {
  let fenceLength = 3
  for (const match of context.body.matchAll(/`+/g)) {
    fenceLength = Math.max(fenceLength, match[0].length + 1)
  }
  const fence = '`'.repeat(fenceLength)
  const label = contextLabel(context.label)
  return [`${fence}${ASTER_CONTEXT_INFO}${label ? ` ${label}` : ''}`, context.body, fence].join(
    '\n'
  )
}

/** A short request followed by the context blocks the agent needs to act on it. */
export function withAsterContext(request: string, ...contexts: AsterContext[]): string {
  return [request.trim(), ...contexts.map(asterContextBlock)].filter(Boolean).join('\n\n')
}

/** Splits a message into its request and context blocks; null when it carries no complete block. */
export function splitAsterContext(markdown: string): AsterContextMessage | null {
  if (!markdown.includes(ASTER_CONTEXT_INFO)) {
    return null
  }
  const lines = markdown.split('\n')
  const kept: string[] = []
  const contexts: AsterContext[] = []
  for (let index = 0; index < lines.length; index++) {
    const opening = OPENING.exec(lines[index].replace(/\r$/, ''))
    const closing = opening ? new RegExp(`^${opening[1]}\`*[ \\t]*\\r?$`) : null
    let close = -1
    for (let at = index + 1; closing && at < lines.length && close < 0; at++) {
      close = closing.test(lines[at]) ? at : -1
    }
    if (!opening || close < 0) {
      kept.push(lines[index])
      continue
    }
    contexts.push({
      label: contextLabel(opening[2] ?? ''),
      body: lines.slice(index + 1, close).join('\n')
    })
    index = close
  }
  return contexts.length ? { request: kept.join('\n').trim(), contexts } : null
}

/** The request alone, for titles and previews; the whole text when it has no context block. */
export function asterContextRequestText(markdown: string): string {
  return splitAsterContext(markdown)?.request ?? markdown
}
