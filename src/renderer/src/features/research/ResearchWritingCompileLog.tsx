import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { compileLogProblems, compileStatusText } from './research-writing-compile-log'

/** `Downloading TeX packages (one-time)… 34s` while a build runs. */
export function ResearchWritingCompileStatus({
  log,
  startedAt
}: {
  log: string
  startedAt: number | null
}): React.JSX.Element {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  const seconds = startedAt ? Math.max(0, Math.round((now - startedAt) / 1000)) : 0
  return (
    <span
      role="status"
      className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-muted-foreground"
    >
      <Loader2 className="size-3 shrink-0 animate-spin" aria-hidden />
      <span className="truncate">{compileStatusText(log)}</span>
      <span className="shrink-0 tabular-nums">{seconds}s</span>
    </span>
  )
}

/** The build's full output, with the engine's `file:line` problems as links to the TeX source. */
export function ResearchWritingCompileLogDialog({
  open,
  onOpenChange,
  log,
  compiling,
  error,
  mainSourcePath,
  onOpenSource
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  log: string
  compiling: boolean
  error: string | null
  mainSourcePath: string
  onOpenSource?: (sourcePath: string, line: number) => void
}): React.JSX.Element {
  const problems = useMemo(() => compileLogProblems(log, mainSourcePath), [log, mainSourcePath])
  const logRef = useRef<HTMLPreElement>(null)
  useEffect(() => {
    // Why: a running build appends at the bottom; follow it like a terminal.
    if (open && compiling && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [open, compiling, log])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Build log</DialogTitle>
          <DialogDescription>
            {compiling ? compileStatusText(log) : (error ?? 'Output of the last Tectonic build.')}
          </DialogDescription>
        </DialogHeader>
        {problems.length ? (
          <ul className="scrollbar-sleek max-h-36 space-y-0.5 overflow-auto" aria-label="Problems">
            {problems.map((problem) => (
              <li key={`${problem.severity}:${problem.file}:${problem.line}:${problem.message}`}>
                <button
                  type="button"
                  disabled={!problem.sourcePath || !onOpenSource}
                  className="grid w-full grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-2 rounded-md px-2 py-1 text-left text-xs hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:hover:bg-transparent"
                  onClick={() => {
                    if (problem.sourcePath && onOpenSource) {
                      onOpenSource(problem.sourcePath, problem.line)
                      onOpenChange(false)
                    }
                  }}
                >
                  <span
                    className={cn(
                      'font-mono',
                      problem.severity === 'error' ? 'text-destructive' : 'text-muted-foreground'
                    )}
                  >
                    {problem.file}:{problem.line}
                  </span>
                  <span className="truncate">{problem.message}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <pre
          ref={logRef}
          className="scrollbar-sleek max-h-[50vh] min-h-24 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/40 p-3 font-mono text-2xs"
        >
          {log || (compiling ? 'Waiting for Tectonic…' : 'No output.')}
        </pre>
      </DialogContent>
    </Dialog>
  )
}
