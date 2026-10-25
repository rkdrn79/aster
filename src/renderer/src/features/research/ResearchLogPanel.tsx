import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import type { ResearchTextTail } from './research-source-reader'
import { classifyLogLines, filterLogLines } from './research-log-lines'

const SHOWN_LINES = 1000

export function ResearchLogPanel({
  path,
  log,
  error,
  failed = false,
  onOpenFull
}: {
  path: string
  log: ResearchTextTail | null
  error: string | null
  /** A failed Run's log names its error lines in the heading. */
  failed?: boolean
  /** Opens the whole file in the editor; absent where no editor can reach it. */
  onOpenFull?: () => void
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [showMetricLines, setShowMetricLines] = useState(false)
  const [copiedText, setCopiedText] = useState<string | null>(null)
  const [copyFailedFor, setCopyFailedFor] = useState<string | null>(null)
  const scroller = useRef<HTMLDivElement | null>(null)
  // Why: a log is read from its tail; stay pinned there until the reader scrolls up.
  const pinnedToTail = useRef(true)
  const lines = useMemo(() => classifyLogLines(log?.text ?? ''), [log?.text])
  const matchingLines = filterLogLines(lines, { showMetricLines, query })
  const visibleLines = matchingLines.slice(-SHOWN_LINES)
  const hiddenMetricLines = showMetricLines
    ? 0
    : lines.filter((line) => line.kind === 'metric').length
  const errorLines = lines.filter((line) => line.kind === 'error').length
  const search = query.trim()

  useLayoutEffect(() => {
    const element = scroller.current
    if (element && (pinnedToTail.current || search)) {
      element.scrollTop = element.scrollHeight
    }
  }, [log?.text, showMetricLines, search])

  async function copyLoadedTail(): Promise<void> {
    if (!log) {
      return
    }
    try {
      await window.api.ui.writeClipboardText(log.text)
      setCopiedText(log.text)
      setCopyFailedFor(null)
    } catch {
      setCopiedText(null)
      setCopyFailedFor(log.text)
    }
  }

  const status =
    error && log
      ? " · couldn't refresh"
      : log
        ? log.truncated
          ? ' · last 256 KiB'
          : ''
        : ' · unavailable'

  return (
    <section aria-label="Run log">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium" title={path}>
          Log{status}
          {failed && errorLines ? (
            <span className="ml-2 text-xs font-normal text-destructive">
              {errorLines} error {errorLines === 1 ? 'line' : 'lines'} highlighted
            </span>
          ) : null}
        </h3>
        {onOpenFull ? (
          <Button size="xs" variant="ghost" onClick={onOpenFull}>
            <ExternalLink aria-hidden />
            Open full log
          </Button>
        ) : null}
      </div>
      {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
      {log ? (
        <>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Input
              aria-label="Search loaded log tail"
              placeholder="Search log"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-8 min-w-48 flex-1"
            />
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Switch
                checked={showMetricLines}
                onCheckedChange={setShowMetricLines}
                aria-label="Show metric lines"
              />
              Show metric lines
            </label>
            <Button size="xs" variant="outline" onClick={() => void copyLoadedTail()}>
              Copy log
            </Button>
          </div>
          {search || visibleLines.length < matchingLines.length || hiddenMetricLines ? (
            <p className="mt-1 text-2xs text-muted-foreground">
              {search || visibleLines.length < matchingLines.length
                ? `Showing ${visibleLines.length} of ${matchingLines.length} ${search ? 'matching ' : ''}${matchingLines.length === 1 ? 'line' : 'lines'}`
                : null}
              {hiddenMetricLines
                ? `${search || visibleLines.length < matchingLines.length ? ' · ' : ''}${hiddenMetricLines} ASTER_METRIC/ASTER_MEDIA ${hiddenMetricLines === 1 ? 'line' : 'lines'} hidden`
                : null}
            </p>
          ) : null}
          {copiedText === log.text ? (
            <p role="status" className="text-xs text-muted-foreground">
              Copied.
            </p>
          ) : null}
          {copyFailedFor === log.text ? (
            <p role="alert" className="text-xs text-destructive">
              Could not copy the log. Try again.
            </p>
          ) : null}
          <div
            ref={scroller}
            onScroll={(event) => {
              const element = event.currentTarget
              pinnedToTail.current =
                element.scrollHeight - element.scrollTop - element.clientHeight < 24
            }}
            className="scrollbar-sleek mt-2 max-h-[min(28rem,60vh)] overflow-auto rounded-md bg-muted py-2 font-mono text-xs"
          >
            <pre data-log-lines className="whitespace-pre-wrap break-words">
              {visibleLines.length ? (
                visibleLines.map((line, index) => (
                  <span
                    key={index}
                    className={cn(
                      'block px-3',
                      line.kind === 'error' && 'bg-destructive/10 text-destructive',
                      line.kind === 'metric' && 'text-muted-foreground'
                    )}
                  >
                    {line.text || ' '}
                  </span>
                ))
              ) : (
                <span className="block px-3">
                  {search ? 'No matching lines.' : 'The log is empty.'}
                </span>
              )}
            </pre>
          </div>
        </>
      ) : null}
    </section>
  )
}
