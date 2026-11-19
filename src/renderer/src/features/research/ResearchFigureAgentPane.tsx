import { useCallback, useRef, useState } from 'react'
import { ChevronDown, ImagePlus, Layers, LayoutTemplate, ScrollText } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useResearchRecords } from './research-records-store'
import { ResearchAgentChatPane } from './ResearchAgentChatPane'
import { ResearchChip } from './research-chip'
import { ResearchFigureAgentWatcher } from './ResearchFigureAgentWatcher'
import { ResearchFigureChatScope } from './ResearchFigureChatScope'
import { ResearchFigureCarefulCard } from './ResearchFigureCarefulCard'
import { ResearchFigureModesBar } from './ResearchFigureModesBar'
import { useEffectiveFigureModes } from './research-figure-reference-library'
import type { ProjectFileOwner } from './research-project-files'
import { useCarefulState, useFigureCriticWatcher } from './use-figure-careful'
import { ResearchFigureOverwriteDialog } from './ResearchFigureOverwriteDialog'
import { noteTypedFigureMessage } from './research-figure-agent-actions'
import { useFigureHistoryShortcut } from './research-figure-history-tab'
import { figureSessionWorking } from './research-figure-turn-status'
import { setFigureVariantsMode, useFigureVariantsMode } from './research-figure-variants'
import type { FigureQuickRequest } from './research-figures-agent-prompts'
import {
  figureQuickActions,
  type FigureCanvasState,
  type FigureQuickAction,
  type FigureQuickActionId
} from './research-figure-quick-actions'
import {
  bindFigureAgentSession,
  figureAgentSessionId,
  launchFigureAgent,
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
  /** The open figure, whose chat this shows; null is the project's chat for no open figure. */
  figureKey: string | null
  owner: ProjectFileOwner
  /** The figures working folder, and the open diagram's own folder (null for a plot or none). */
  folders: { work: string | null; figure: string | null }
  /** Sends what the person chose (a sketch to use) to the open figure's chat. */
  onSendText: ((text: string) => Promise<string | null>) | null
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
      className="press-scale flex w-full items-center gap-3 rounded-lg border border-border bg-card px-3 py-3 text-left hover:bg-accent focus-visible:outline-none aria-disabled:cursor-not-allowed aria-disabled:opacity-55"
      onClick={() => {
        if (!disabledReason) {
          onClick()
        }
      }}
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[13px] leading-tight font-medium text-foreground">{title}</span>
        <span className="text-xs leading-snug text-muted-foreground">
          {disabledReason ?? detail}
        </span>
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

/** The open figure's own chat, with requests that send a full prompt naming the exact files. */
export function ResearchFigureAgentPane({
  scope,
  visible,
  onRequest,
  onRecreate,
  onTemplate,
  messageContext,
  canvas,
  figureKey,
  owner,
  folders,
  onSendText
}: Props): React.JSX.Element {
  const boundSessionId = useResearchRecords((state) =>
    figureAgentSessionId(state.document, scope, figureKey)
  )
  // Why by figure: a request still sending on one figure must not hold up the next figure's.
  const [sendingBy, setSendingBy] = useState<Record<string, string>>({})
  const sending = sendingBy[figureKey ?? ''] ?? null
  const [error, setError] = useState<{ figure: string | null; text: string } | null>(null)
  const [escArmed, setEscArmed] = useState(false)
  const variants = useFigureVariantsMode((state) => state.on)
  const modes = useEffectiveFigureModes(scope)
  const carefulTarget =
    folders.figure !== null && figureKey !== null
      ? { folder: folders.figure, slug: figureKey }
      : null
  const careful = useCarefulState(owner, carefulTarget, modes.careful)
  useFigureCriticWatcher(
    scope,
    owner,
    [...new Set([folders.work, folders.figure].filter((entry) => entry !== null))],
    modes.careful
  )
  const escAtRef = useRef(0)
  useFigureHistoryShortcut()
  const decorateMessage = useCallback(
    (sessionId: string, text: string) => {
      noteTypedFigureMessage(scope, sessionId, text)
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
    const figure = figureKey ?? ''
    setSendingBy((current) => ({ ...current, [figure]: id }))
    setError(null)
    const failure = await onRequest(id)
    setSendingBy((current) => {
      const { [figure]: _done, ...others } = current
      return others
    })
    setError(failure ? { figure: figureKey, text: failure } : null)
  }

  const button = (action: FigureQuickAction): React.JSX.Element => (
    <ResearchChip
      key={action.id}
      aria-label={action.label}
      title={action.disabledReason ?? undefined}
      disabled={sending !== null || action.disabledReason !== null}
      onClick={() => void run(action.id)}
    >
      {sending === action.id ? 'Sending…' : action.label}
    </ResearchChip>
  )

  const shownError = error && error.figure === figureKey ? error.text : null

  /** While the agent works, Esc in the composer needs a second press to stop it. */
  function guardEscape(event: React.KeyboardEvent): void {
    if (event.key !== 'Escape' || !isTyping(event.target)) {
      return
    }
    if (!boundSessionId || !figureSessionWorking(boundSessionId)) {
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
        key={figureKey ?? ''}
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
            <div role="group" aria-label="Start a figure" className="flex flex-col gap-2">
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
        onBind={(sessionId) => bindFigureAgentSession(scope, figureKey, sessionId)}
        onLaunch={(agent) => launchFigureAgent(scope, figureKey, agent)}
        decorateMessage={decorateMessage}
        toolbar={
          <>
            {onRequest ? (
              <div className="flex shrink-0 flex-col gap-2 px-3 pt-3 pb-0.5">
                {boundSessionId ? (
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Figure requests">
                    {actions.primary.map(button)}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <ResearchChip
                          tone="quiet"
                          className="gap-1 px-3"
                          aria-label="More figure requests"
                          disabled={sending !== null}
                        >
                          More <ChevronDown aria-hidden />
                        </ResearchChip>
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
                    <ResearchChip
                      tone="quiet"
                      className="px-3"
                      aria-pressed={variants}
                      title="Quick actions draw three variants beside the figure; you preview and adopt one"
                      onClick={() => setFigureVariantsMode(!variants)}
                    >
                      <Layers aria-hidden /> Variants ×3
                    </ResearchChip>
                  </div>
                ) : null}
                <ResearchFigureModesBar scope={scope} />
                {shownError && boundSessionId ? (
                  <p role="alert" className="text-xs text-destructive">
                    {shownError}
                  </p>
                ) : null}
              </div>
            ) : null}
            {modes.careful ? (
              <ResearchFigureCarefulCard
                state={careful}
                pick={modes.pick}
                onPick={
                  onSendText
                    ? (name) =>
                        onSendText(
                          `Use sketch ${name}: I picked it in the panel. Record it with \`figures careful --chose ${name} --by person\`, draw it in full and go on with the art director rounds.`
                        )
                    : null
                }
              />
            ) : null}
            <ResearchFigureChatScope scope={scope} escArmed={escArmed} />
          </>
        }
      />
    </div>
  )
}
