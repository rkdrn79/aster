import { toast } from 'sonner'
import { useFigureEditorHandle } from './research-figure-editor-handle'
import { restoreFigureText } from './research-figure-history'
import {
  attachFigureTurnSession,
  beginFigureTurn,
  dismissFigureTurnBar,
  failFigureTurn,
  figureTurnEntry,
  sameFigureTarget
} from './research-figure-turn'
import { sendFigurePrompt, type FiguresAgentScope } from './research-figures-agent-session'
import type { FigureTarget } from './research-figures-export'
import { openPlotTarget } from './research-figures-store'

/** The open figure and its scene text now; the editor registers the reader with its handle. */
function openFigureText(): {
  text: string | null
  handle: ReturnType<typeof useFigureEditorHandle.getState>['handle']
} {
  const handle = useFigureEditorHandle.getState().handle
  return { text: handle ? handle.sceneText() : null, handle }
}

/** A message typed in a figure's chat is a request too: keep "before send" and track the turn. */
export function noteTypedFigureMessage(
  scope: FiguresAgentScope,
  sessionId: string,
  text: string
): void {
  if (!text.trim() || text.startsWith('/')) {
    return
  }
  // Why at once: the message goes out right after this returns. A turn begun a tick later can
  // miss a quick agent's whole working spell, and would then wait on "Sending…" for good.
  const { text: before, handle } = openFigureText()
  // Why the open plot: it has no editor, and its History keeps its files around the turn too.
  const plot = handle ? null : openPlotTarget(scope)
  beginFigureTurn({
    target: handle?.target ?? plot,
    plot: plot !== null,
    request: text,
    prompt: text,
    scope,
    beforeText: before,
    sessionId
  })
}

/**
 * Stops the Figure chat's turn through the chat's own Stop control, so the stop follows the same
 * path (and fence) as pressing ■ in the composer.
 */
export function stopFigureAgent(): boolean {
  const stop = document.querySelector<HTMLButtonElement>(
    '[data-figure-agent-pane] [data-native-chat-critical-action="stop"]'
  )
  if (!stop || stop.disabled) {
    toast.message('Open the Figure chat to stop the agent')
    return false
  }
  stop.click()
  return true
}

/** Sends the figure's last request again as a new turn. */
export async function retryFigureTurn(target: FigureTarget): Promise<void> {
  const turn = figureTurnEntry(target)?.turn
  if (!turn) {
    return
  }
  const { text, handle } = openFigureText()
  const id = beginFigureTurn({
    target: turn.target,
    plot: turn.plot ?? false,
    request: turn.request,
    prompt: turn.prompt,
    scope: turn.scope,
    beforeText: handle && sameFigureTarget(handle.target, turn.target) ? text : null
  })
  const failure = await sendFigurePrompt(turn.scope, turn.target.slug, turn.prompt, {
    onSession: (sessionId) => attachFigureTurnSession(id, sessionId)
  })
  if (failure) {
    failFigureTurn(id, failure)
  }
}

/** Puts the figure back to its "before send" version in one step; the agent's stays in History. */
export async function undoFigureTurn(target: FigureTarget): Promise<void> {
  const turn = figureTurnEntry(target)?.turn
  if (!turn || turn.beforeText === null) {
    return
  }
  const failure = await restoreFigureText(
    turn.target,
    turn.beforeText,
    `Before undoing: ${turn.request}`
  )
  if (failure) {
    toast.error(failure)
    return
  }
  dismissFigureTurnBar(turn.target)
  toast.success('Undid the agent turn', {
    description: "The agent's version is still in History."
  })
}
