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

/** The open figure's scene text, without loading the editor's chunk here. */
async function openFigureText(): Promise<{
  text: string | null
  handle: ReturnType<typeof useFigureEditorHandle.getState>['handle']
}> {
  const handle = useFigureEditorHandle.getState().handle
  if (!handle) {
    return { text: null, handle: null }
  }
  const { figureSceneText } = await import('./research-figures-export')
  return { text: figureSceneText(handle.api), handle }
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
  void openFigureText().then(({ text: before, handle }) =>
    beginFigureTurn({
      target: handle?.target ?? null,
      request: text,
      prompt: text,
      scope,
      beforeText: before,
      sessionId
    })
  )
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
    toast.message('Open the Figure chat to stop the agent.')
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
  const { text, handle } = await openFigureText()
  const id = beginFigureTurn({
    target: turn.target,
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
  toast.success('Undid the agent turn.', {
    description: "The agent's version is still in History."
  })
}
