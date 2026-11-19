import { useState } from 'react'
import { ChartLine, MessageSquarePlus, Shapes } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useResearchFigures } from './research-figures-store'
import { launchFigureAgent, type FiguresAgentScope } from './research-figures-agent-session'

/** The chat's figure, as a "Figure: …" chip, and a fresh chat for this figure alone. */
export function ResearchFigureChatScope({
  scope,
  escArmed
}: {
  scope: FiguresAgentScope
  escArmed: boolean
}): React.JSX.Element | null {
  const figure = useResearchFigures((state) =>
    state.selected?.kind === 'figure' || state.selected?.kind === 'plot'
      ? state.selected.slug
      : null
  )
  const plot = useResearchFigures((state) => state.selected?.kind === 'plot')
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!figure && !escArmed) {
    return null
  }

  async function startChat(): Promise<void> {
    setStarting(true)
    setError(await launchFigureAgent(scope, figure, 'claude'))
    setStarting(false)
  }

  return (
    <div className="shrink-0 border-b border-border px-3 py-2 text-xs">
      {figure ? (
        <div className="flex items-center gap-2">
          <span
            className="inline-flex h-6 min-w-0 items-center gap-2 rounded-md bg-muted px-2 text-foreground/80"
            title={plot ? 'This chat works on this plot' : 'This chat works on this figure'}
          >
            {plot ? (
              <ChartLine className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            ) : (
              <Shapes className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            )}
            <span className="truncate">
              {plot ? 'Plot' : 'Figure'}: {figure}
            </span>
          </span>
          <Button
            size="xs"
            variant="ghost"
            className="ml-auto h-7"
            disabled={starting}
            aria-label="New chat for this figure"
            title="Start a fresh Figure chat for this figure"
            onClick={() => void startChat()}
          >
            <MessageSquarePlus aria-hidden /> {starting ? 'Starting…' : 'New chat'}
          </Button>
        </div>
      ) : null}
      {escArmed ? (
        <p role="status" className="mt-1 text-2xs text-status-warning">
          Press Esc again to stop the agent
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
