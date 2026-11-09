import { useCallback, useRef, useState } from 'react'
import { ChevronDown, ImagePlus, LayoutTemplate, ScrollText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useResearchRecords } from './research-records-store'
import { ResearchAgentChatPane } from './ResearchAgentChatPane'
import { ResearchFigureAgentWatcher } from './ResearchFigureAgentWatcher'
import { ResearchFigureChatScope } from './ResearchFigureChatScope'
import { ResearchFigureOverwriteDialog } from './ResearchFigureOverwriteDialog'
import { noteTypedFigureMessage } from './research-figure-agent-actions'
import { useFigureHistoryShortcut } from './research-figure-history-tab'
import { useFigureTurn } from './research-figure-turn'
import { setFigureVariantsMode, useFigureVariantsMode } from './research-figure-variants'
import type { FigureQuickRequest } from './research-figures-agent-prompts'
import {
  figureQuickActions,
  type FigureCanvasState,
  type FigureQuickAction,
  type FigureQuickActionId
} from './research-figure-quick-actions'
import {
  bindFiguresAgentSession,
  figuresAgentSessionId,
  launchFiguresAgent,
  withFigureMessageContext,
  type FigureMessageContext,
  type FiguresAgentScope
} from './research-figures-agent-session'

export const FIGURE_COMPOSER_PLACEHOLDER = 'Describe a figure or a change…'

type Props = {
  scope: FiguresAgentScope
  visible: boolean
  /** Null until the figures folder is known, which hides the quick actions. */
  onRequest: ((request: FigureQuickRequest) => Promise<string | null>) | null
  /** Opens the Recreate from image dialog. */
  onRecreate: () => void
  /** Starts a figure from a kit template. */
  onTemplate: () => void
  /** The open figure's context, attached to typed messages when the agent has not seen it. */
  messageContext: () => FigureMessageContext | null
  /** What is on the canvas, so only actions that can run are offered. */
  canvas: FigureCanvasState
  /** The open figure; an error from one figure is not shown on the next. */
  figureKey: string | null
}

function StarterCard({
  icon: Icon,
  title,
  detail,
  disabledReason,
  onClick
}: {
  icon: typeof ScrollText
  title: string
  detail: string
  disabledReason: string | null
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-label={title}
      aria-disabled={disabledReason ? true : undefined}
      title={disabledReason ?? detail}
      className="flex w-full items-start gap-2 rounded-md border border-border bg-background px-2.5 py-2 text-left hover:bg-accent aria-disabled:cursor-not-allowed aria-disabled:opacity-55"
      onClick={() => {
        if (!disabledReason) {
          onClick()
        }
      }}
    >
      <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="flex min-w-0 flex-col">
        <span className="text-xs font-medium text-foreground">{title}</span>
        <span className="text-2xs text-muted-foreground">{disabledReason ?? detail}</span>
      </span>
    </button>
  )
}

const ESC_AGAIN_MS = 2000

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')
  )
}

/** The project's Figure chat, with requests that send a full prompt naming the exact files. */
export function ResearchFigureAgentPane({
  scope,
  visible,
  onRequest,
  onRecreate,
  onTemplate,
  messageContext,
  canvas,
  figureKey
}: Props): React.JSX.Element {
  const boundSessionId = useResearchRecords((state) => figuresAgentSessionId(state.document, scope))
  const [sending, setSending] = useState<string | null>(null)
  const [error, setError] = useState<{ figure: string | null; text: string } | null>(null)
  const [escArmed, setEscArmed] = useState(false)
  const variants = useFigureVariantsMode((state) => state.on)
  const escAtRef = useRef(0)
  useFigureHistoryShortcut()
  const decorateMessage = useCallback(
    (sessionId: string, text: string) => {
      noteTypedFigureMessage(scope, text)
      return withFigureMessageContext(sessionId, text, messageContext())
    },
    [messageContext, scope]
  )
  const actions = figureQuickActions(canvas)
  const recreateReason = canvas === 'none' ? 'Open or create a figure first.' : null

  async function run(id: FigureQuickActionId): Promise<void> {
    if (id === 'recreate') {
      onRecreate()
      return
    }
    if (!onRequest) {
      return
    }
    setSending(id)
    setError(null)
    const failure = await onRequest(id)
    setSending(null)
    setError(failure ? { figure: figureKey, text: failure } : null)
  }

  const button = (action: FigureQuickAction): React.JSX.Element => (
    <Button
      key={action.id}
      size="xs"
      variant="outline"
      aria-label={action.label}
      title={action.disabledReason ?? undefined}
      disabled={sending !== null || action.disabledReason !== null}
      onClick={() => void run(action.id)}
    >
      {sending === action.id ? 'Sending…' : action.label}
    </Button>
  )

  const shownError = error && error.figure === figureKey ? error.text : null

  /** While the agent works, Esc in the composer needs a second press to stop it. */
  function guardEscape(event: React.KeyboardEvent): void {
    if (event.key !== 'Escape' || !isTyping(event.target)) {
      return
    }
    if (!useFigureTurn.getState().agentWorking) {
      return
    }
    if (Date.now() - escAtRef.current < ESC_AGAIN_MS) {
      escAtRef.current = 0
      setEscArmed(false)
      return
    }
    escAtRef.current = Date.now()
    // Why preventDefault: the composer leaves an Escape another layer already spent alone.
    event.preventDefault()
    setEscArmed(true)
    window.setTimeout(() => setEscArmed(false), ESC_AGAIN_MS)
  }

  return (
    <div
      data-figure-agent-pane=""
      className="flex min-h-0 min-w-0 flex-1 flex-col"
      style={{ display: visible ? 'flex' : 'none' }}
      onKeyDownCapture={guardEscape}
    >
      <ResearchFigureAgentWatcher scope={scope} />
      <ResearchFigureOverwriteDialog />
      <ResearchAgentChatPane
        workspaceId={scope.workspaceId}
        hostId={scope.hostId}
        boundSessionId={boundSessionId}
        home={{ kind: 'figures' }}
        title="Figure agent"
        sessionLabel="Figure agent chat"
        composerPlaceholder={FIGURE_COMPOSER_PLACEHOLDER}
        emptyHint={
          <div className="flex w-full max-w-xs flex-col items-stretch gap-2">
            <p className="text-sm text-muted-foreground">{FIGURE_COMPOSER_PLACEHOLDER}</p>
            <div role="group" aria-label="Start a figure" className="flex flex-col gap-1.5">
              <StarterCard
                icon={ScrollText}
                title="Draw from Method"
                detail="Reads the method section and draws it"
                disabledReason={onRequest ? null : 'The figures folder is still loading.'}
                onClick={() => void run('draw-method')}
              />
              <StarterCard
                icon={ImagePlus}
                title="Recreate from image"
                detail="Redraws a published figure as shapes"
                disabledReason={recreateReason}
                onClick={onRecreate}
              />
              <StarterCard
                icon={LayoutTemplate}
                title="Start from a template"
                detail="Transformer, CLIP, U-Net, diffusion…"
                disabledReason={null}
                onClick={onTemplate}
              />
            </div>
            {shownError ? (
              <p role="alert" className="text-xs text-destructive">
                {shownError}
              </p>
            ) : null}
          </div>
        }
        visible={visible}
        className="flex-1"
        onBind={(sessionId) => bindFiguresAgentSession(scope, sessionId)}
        onLaunch={(agent) => launchFiguresAgent(scope, agent)}
        decorateMessage={decorateMessage}
        toolbar={
          <>
            {onRequest && boundSessionId ? (
              <div className="shrink-0 border-b border-border px-3 py-2">
                <div className="flex flex-wrap gap-1" role="group" aria-label="Figure requests">
                  {actions.primary.map(button)}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="xs"
                        variant="ghost"
                        aria-label="More figure requests"
                        disabled={sending !== null}
                      >
                        More <ChevronDown aria-hidden />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="min-w-56">
                      {actions.more.map((action) => (
                        <DropdownMenuItem
                          key={action.id}
                          disabled={action.disabledReason !== null}
                          onSelect={() => void run(action.id)}
                        >
                          <span className="flex min-w-0 flex-col">
                            <span>{action.label}</span>
                            {action.disabledReason ? (
                              <span className="text-2xs text-muted-foreground">
                                {action.disabledReason}
                              </span>
                            ) : null}
                          </span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button
                    size="xs"
                    variant={variants ? 'secondary' : 'ghost'}
                    aria-pressed={variants}
                    title="Quick actions draw three variants beside the figure; you preview and adopt one"
                    onClick={() => setFigureVariantsMode(!variants)}
                  >
                    Variants ×3
                  </Button>
                </div>
                {shownError ? (
                  <p role="alert" className="mt-1.5 text-xs text-destructive">
                    {shownError}
                  </p>
                ) : null}
              </div>
            ) : null}
            <ResearchFigureChatScope
              scope={scope}
              sessionId={boundSessionId ?? null}
              escArmed={escArmed}
            />
          </>
        }
      />
    </div>
  )
}
