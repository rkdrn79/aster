import { useEffect, useState } from 'react'
import { Hand } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { figurePreviewPaths } from '../../../../research-harness/research-figures-model.mjs'
import { noteFigurePreview, useFigureCoworkEntry } from './research-figure-cowork-store'
import { forgetFigurePersonEdits } from './research-figure-person-edits'
import type { FigureTarget } from './research-figures-export'
import { projectRecordRoot, readProjectText } from './research-project-files'

// Why so long: the note answers "did the agent just change this?" for a person who looked away.
const AGENT_NOTE_MS = 10 * 60_000

function ago(at: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000))
  if (seconds < 60) {
    return `${Math.max(1, seconds)} s ago`
  }
  const minutes = Math.round(seconds / 60)
  return minutes < 60 ? `${minutes} min ago` : `${Math.round(minutes / 60)} h ago`
}

/** The preview the agent last saw, from its sidecar, when the page opens. */
async function readPreviewNote(target: FigureTarget): Promise<void> {
  const paths = figurePreviewPaths(await projectRecordRoot(target.owner), target.slug)
  const value: unknown = JSON.parse(await readProjectText(target.owner, paths.sidecar))
  const renderedAt = value && typeof value === 'object' ? Reflect.get(value, 'renderedAt') : null
  const renderer = value && typeof value === 'object' ? Reflect.get(value, 'renderer') : null
  if (typeof renderedAt === 'string') {
    noteFigurePreview(target, {
      renderedAt,
      renderer: renderer === 'background' || renderer === 'editor' ? renderer : undefined
    })
  }
}

/**
 * Under the toolbar: when the preview the agent sees was drawn and by what, that the agent
 * changed this figure, and the person's hand edits Aster keeps over the agent's script.
 */
export function ResearchFigureCoworkBar({
  target
}: {
  target: FigureTarget
}): React.JSX.Element | null {
  const cowork = useFigureCoworkEntry(target)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    void readPreviewNote(target).catch(() => undefined)
  }, [target])
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 5000)
    return () => window.clearInterval(timer)
  }, [])
  const previewAt = cowork.preview ? Date.parse(cowork.preview.renderedAt) : Number.NaN
  const agent = cowork.agent && now - cowork.agent.at < AGENT_NOTE_MS ? cowork.agent : null
  const edits = cowork.edits
  if (!Number.isFinite(previewAt) && !agent && !edits) {
    return null
  }
  return (
    <div
      role="status"
      aria-label="Figure shared with the agent"
      className="flex h-8 shrink-0 items-center gap-3 border-b border-border px-3 text-xs text-muted-foreground"
    >
      {Number.isFinite(previewAt) ? (
        <span title="The PNG the agent looks at (figures preview)">
          Preview updated {ago(previewAt, now)}
          {cowork.preview?.renderer === 'background' ? ', rendered in background' : ''}
        </span>
      ) : null}
      {agent ? (
        <span className="text-foreground">
          The agent changed this figure · {agent.changed}{' '}
          {agent.changed === 1 ? 'element' : 'elements'} · {ago(agent.at, now)}
        </span>
      ) : null}
      {edits?.count ? (
        <Popover>
          <PopoverTrigger asChild>
            <Button size="xs" variant="ghost" className="ml-auto h-6">
              <Hand aria-hidden /> Your edits kept: {edits.count}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-96">
            <div className="text-xs">
              <p className="mb-2 text-muted-foreground">
                What you changed by hand stays when the agent runs its script again, and the agent
                is told to build on it.
              </p>
              <ul className="mb-2 space-y-1">
                {edits.lines.map((line) => (
                  <li key={line} className="break-words">
                    {line}
                  </li>
                ))}
              </ul>
              {edits.overrode.length ? (
                <p className="mb-2 text-status-warning">
                  The agent&apos;s last run changed{' '}
                  {edits.overrode.length === 1 ? 'one thing' : `${edits.overrode.length} things`}{' '}
                  you set; yours {edits.overrode.length === 1 ? 'was' : 'were'} kept.
                </p>
              ) : null}
              <Button
                size="xs"
                variant="outline"
                onClick={() => void forgetFigurePersonEdits(target, null)}
              >
                Let the agent change these again
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  )
}
