import { useState } from 'react'
import { MessageSquarePlus, Shapes } from 'lucide-react'
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
    state.selected?.kind === 'figure' ? state.selected.slug : null
  )
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
    <div className="shrink-0 border-b border-border px-3 py-1.5 text-xs">
      {figure ? (
        <div className="flex items-center gap-1.5">
          <span
            className="inline-flex min-w-0 items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-muted-foreground"
            title="This chat works on this figure"
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
