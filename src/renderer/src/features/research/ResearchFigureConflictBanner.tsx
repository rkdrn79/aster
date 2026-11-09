import { Button } from '@/components/ui/button'

type Props = {
  /** Elements both you and the agent changed, waiting for a review. */
  overlaps: number
  invalid: string[] | null
  error: string | null
  areaMode: boolean
  onReview: () => void
}

/** The messages above the canvas: overlapping agent edits, a bad file, a hint. */
export function ResearchFigureConflictBanner({
  overlaps,
  invalid,
  error,
  areaMode,
  onReview
}: Props): React.JSX.Element | null {
  if (overlaps) {
    return (
      <div
        role="alert"
        className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-muted/60 px-3 py-1.5 text-xs"
      >
        <span className="font-medium">The agent changed this figure while you edited it.</span>
        <span className="text-muted-foreground">
          The rest is merged; {overlaps === 1 ? '1 element' : `${overlaps} elements`} changed on
          both sides. Nothing is saved until you choose.
        </span>
        <Button size="xs" variant="outline" className="ml-auto" onClick={onReview}>
          Review
        </Button>
      </div>
    )
  }
  if (invalid?.length) {
    return (
      <p
        role="alert"
        className="shrink-0 border-b border-border px-3 py-1.5 text-xs text-status-warning"
      >
        The file on disk does not open yet, so the canvas keeps the last good version: {invalid[0]}
      </p>
    )
  }
  if (error) {
    return (
      <p
        role="alert"
        className="shrink-0 border-b border-border px-3 py-1.5 text-xs text-destructive"
      >
        {error}
      </p>
    )
  }
  if (areaMode) {
    return (
      <p
        role="status"
        className="shrink-0 border-b border-border px-3 py-1.5 text-xs text-muted-foreground"
      >
        Drag over the part of the figure the agent should fill.
      </p>
    )
  }
  return null
}

/** Instead of the canvas: the file could not be read, does not open yet, or is still loading. */
export function ResearchFigureNotReady({
  error,
  issues
}: {
  error: string | null
  issues: readonly string[]
}): React.JSX.Element {
  if (error) {
    return (
      <p role="alert" className="p-6 text-sm text-destructive">
        {error}
      </p>
    )
  }
  if (issues.length) {
    return (
      <div role="alert" className="space-y-1 p-6 text-sm">
        <p className="font-medium">This figure file does not open yet.</p>
        {issues.slice(0, 8).map((issue) => (
          <p key={issue} className="text-xs text-muted-foreground">
            {issue}
          </p>
        ))}
        <p className="text-xs text-muted-foreground">
          Ask the agent to run `figures check` and fix it.
        </p>
      </div>
    )
  }
  return (
    <p role="status" className="p-6 text-sm text-muted-foreground">
      Opening figure…
    </p>
  )
}
