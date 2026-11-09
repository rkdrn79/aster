import { useState } from 'react'
import { MessageSquarePlus, Shapes } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useResearchFigures } from './research-figures-store'
import {
  launchFiguresAgent,
  useFigureChatScope,
  type FiguresAgentScope
} from './research-figures-agent-session'

/**
 * Which figure the Figure chat is about: a "Figure: …" chip, a "— now: … —" mark when the open
 * figure is not the one the chat last heard about, and a fresh chat for this figure.
 */
export function ResearchFigureChatScope({
  scope,
  sessionId,
  escArmed
}: {
  scope: FiguresAgentScope
  sessionId: string | null
  escArmed: boolean
}): React.JSX.Element | null {
  const figure = useResearchFigures((state) =>
    state.selected?.kind === 'figure' ? state.selected.slug : null
  )
  const heard = useFigureChatScope((state) =>
    sessionId ? state.figureBySession[sessionId] : undefined
  )
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!figure && !escArmed) {
    return null
  }
  const switched = Boolean(sessionId && figure && heard !== undefined && heard !== figure)

  async function startChat(): Promise<void> {
    setStarting(true)
    setError(await launchFiguresAgent(scope, 'claude'))
    setStarting(false)
  }

  return (
    <div className="shrink-0 border-b border-border px-3 py-1.5 text-xs">
      {figure ? (
        <div className="flex items-center gap-1.5">
          <span
            className="inline-flex min-w-0 items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-muted-foreground"
            title="Typed messages tell the agent about this figure"
          >
            <Shapes className="size-3 shrink-0" aria-hidden />
            <span className="truncate">Figure: {figure}</span>
          </span>
          <Button
            size="xs"
            variant="ghost"
            className="ml-auto"
            disabled={starting}
            aria-label="New chat for this figure"
            title="Start a fresh Figure chat for this figure"
            onClick={() => void startChat()}
          >
            <MessageSquarePlus aria-hidden /> {starting ? 'Starting…' : 'New chat'}
          </Button>
        </div>
      ) : null}
      {switched ? (
        <p
          role="status"
          className="mt-1 flex items-center gap-2 text-2xs text-muted-foreground"
          aria-label={`The chat now talks about ${figure}`}
        >
          <span className="h-px flex-1 bg-border" aria-hidden />
          <span className="shrink-0">now: {figure}</span>
          <span className="h-px flex-1 bg-border" aria-hidden />
        </p>
      ) : null}
      {escArmed ? (
        <p role="status" className="mt-1 text-2xs text-status-warning">
          Press Esc again to stop the agent.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-1 text-2xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
