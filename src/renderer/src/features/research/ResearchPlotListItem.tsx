import { Check, ChartLine, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { FigurePaperState } from '../../../../research-harness/research-figures-locations.mjs'
import { FigureListBadge, FigureThumbnailImage, figurePaperIssue } from './ResearchFigureListItem'
import { useFigureAgentEditing } from './research-figure-turn'
import { plotRunHint, type PlotState } from './research-plot-files'
import type { ProjectFileOwner } from './research-project-files'

/** The small plain tag that tells a plot from a diagram in the list. */
export function PlotTag(): React.JSX.Element {
  return (
    <span className="inline-flex h-4 shrink-0 items-center rounded-sm border border-border px-1 text-2xs leading-none text-muted-foreground">
      Plot
    </span>
  )
}

/** One plot in the Figures list: its rendered PNG, name, badges, and the paper update. */
export function ResearchPlotListItem({
  owner,
  slug,
  state,
  active,
  usages,
  paperState,
  updatingPaper,
  onSelect,
  onUpdatePaper
}: {
  owner: ProjectFileOwner
  slug: string
  /** Null while its files are read. */
  state: PlotState | null
  active: boolean
  /** Manuscript lines that include it. */
  usages: readonly number[]
  paperState: FigurePaperState
  updatingPaper: boolean
  onSelect: () => void
  onUpdatePaper: () => void
}): React.JSX.Element {
  const editing = useFigureAgentEditing(owner, slug)
  const runHint = state ? plotRunHint(state.run) : null
  const paperIssue = figurePaperIssue(paperState)
  const canUpdate = paperIssue !== null && state?.run === 'current'
  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-lg p-2 text-xs transition-colors duration-(--duration-fast) hover:bg-accent/70',
        active && 'bg-accent hover:bg-accent'
      )}
    >
      <button
        type="button"
        aria-current={active ? 'true' : undefined}
        aria-label={`Open plot ${slug}`}
        className="flex flex-col gap-2 rounded-lg text-left outline-none"
        onClick={onSelect}
      >
        <FigureThumbnailImage
          url={state?.png}
          icon={ChartLine}
          className={cn('h-16 w-full', active && 'border-foreground/25 shadow-raised')}
        />
        <span className="flex min-w-0 items-center gap-2 px-0.5">
          <span className="truncate text-[13px] leading-snug font-medium" title={slug}>
            {slug}
          </span>
          <PlotTag />
        </span>
      </button>
      {usages.length || editing || runHint || paperIssue ? (
        <span className="flex flex-wrap gap-1 px-0.5">
          {usages.length ? (
            <FigureListBadge tone="ok">
              <Check className="size-4" aria-hidden /> In paper
            </FigureListBadge>
          ) : null}
          {editing ? (
            <FigureListBadge tone="busy">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Agent editing
            </FigureListBadge>
          ) : null}
          {runHint ? <FigureListBadge tone="warn">{runHint}</FigureListBadge> : null}
          {paperIssue ? <FigureListBadge tone="warn">{paperIssue}</FigureListBadge> : null}
        </span>
      ) : null}
      {canUpdate ? (
        <Button
          size="xs"
          variant="outline"
          className="ml-0.5 self-start"
          aria-label={`Update ${slug} in paper`}
          disabled={updatingPaper}
          onClick={onUpdatePaper}
        >
          {updatingPaper ? 'Updating…' : 'Update in paper'}
        </Button>
      ) : null}
    </div>
  )
}
