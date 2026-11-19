import { useState } from 'react'
import { ChartLine, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ListedPlot } from '../../../../research-harness/research-figures-locations.mjs'
import { figureSizeLabel } from '../../../../research-harness/research-figures-model.mjs'
import type { PlotFinding } from '../../../../research-harness/research-figures-plot-files.mjs'
import { PlotTag } from './ResearchPlotListItem'
import {
  plotFindingCounts,
  plotFindingText,
  plotIncludeLine,
  plotPublishBlocked,
  usePlotPublish,
  usePlotState,
  type PlotState
} from './research-plot-files'
import type { ProjectFileOwner } from './research-project-files'
import { ResearchSegmentedTrack, researchSegmentClass } from './research-segmented-track'

type PlotTab = 'plot' | 'script'

const LEVELS = [
  { key: 'errors', label: 'ERROR' },
  { key: 'warnings', label: 'warning' },
  { key: 'notes', label: 'note' }
] as const

/** What the plot's last run checked, under its script: level, code and message. */
function PlotFindings({ state }: { state: PlotState }): React.JSX.Element | null {
  const manifest = state.manifest
  if (!manifest) {
    return null
  }
  const rows = LEVELS.flatMap(({ key, label }) =>
    manifest.findings[key].map((finding: PlotFinding, index) => ({
      key: `${key}-${index}`,
      label,
      error: key === 'errors',
      finding
    }))
  )
  return (
    <section aria-label="Checks" className="flex flex-col gap-2">
      <h3 className="text-xs font-medium text-muted-foreground">
        Checks of the last run{rows.length ? '' : ': nothing to fix'}
      </h3>
      {rows.length ? (
        <ul className="flex flex-col gap-1 text-xs">
          {rows.map((row) => (
            <li key={row.key} className="flex gap-2 leading-snug">
              <span
                className={cn(
                  'w-14 shrink-0 font-mono text-2xs leading-5',
                  row.error ? 'text-destructive' : 'text-muted-foreground'
                )}
              >
                {row.label}
              </span>
              <span className="min-w-0">
                <span className="font-mono text-2xs text-muted-foreground">
                  {row.finding.code}
                  {row.finding.id ? ` · ${row.finding.id}` : ''}
                </span>{' '}
                {row.finding.message}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

function PlotPicture({ slug, state }: { slug: string; state: PlotState }): React.JSX.Element {
  const [naturalWidth, setNaturalWidth] = useState<number | null>(null)
  if (!state.png) {
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border text-center text-xs text-muted-foreground">
        <ChartLine className="size-5 text-muted-foreground/70" aria-hidden />
        No picture yet. Ask the agent to run the script.
      </div>
    )
  }
  return (
    <div
      className="mx-auto w-full rounded-lg border border-border bg-white p-3"
      // Why the PNG's own width: past it the preview only blurs; the PDF is the vector.
      style={{ maxWidth: naturalWidth ? naturalWidth + 26 : undefined }}
    >
      <img
        src={state.png}
        alt={`Plot ${slug}`}
        className="block h-auto w-full"
        onLoad={(event) => setNaturalWidth(event.currentTarget.naturalWidth)}
      />
    </div>
  )
}

/** A plot figure: its rendered picture or its script, the checks, and the paper actions. */
export function ResearchPlotView({
  owner,
  plot,
  manuscript,
  signatures
}: {
  owner: ProjectFileOwner
  plot: ListedPlot
  manuscript: string | null
  signatures: Record<string, string>
}): React.JSX.Element {
  const { slug } = plot
  const [tab, setTab] = useState<PlotTab>('plot')
  const state = usePlotState(owner, plot, signatures)
  const publisher = usePlotPublish(owner, manuscript)
  const size = state?.manifest?.size
  const findings = plotFindingText(plotFindingCounts(state?.manifest ?? null))
  const blocked = state
    ? plotPublishBlocked({ hasPdf: plot.pdf, run: state.run, manuscript })
    : 'Reading the plot…'
  const publishing = publisher.publishing === slug
  const copyLine = (): void =>
    void window.api.ui
      .writeClipboardText(plotIncludeLine(slug))
      .then(() => toast.success('LaTeX line copied'))
      .catch(() => toast.error('The line was not copied.'))

  return (
    <section aria-label={`Plot ${slug}`} className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2 text-xs">
        <span className="truncate text-[13px] font-medium" title={slug}>
          {slug}
        </span>
        <PlotTag />
        {size?.widthIn && size.heightIn ? (
          <span className="text-muted-foreground">
            {figureSizeLabel(size.widthIn, size.heightIn)}
          </span>
        ) : null}
        {findings ? <span className="text-muted-foreground">{findings}</span> : null}
        <ResearchSegmentedTrack aria-label="Show" className="ml-auto">
          {(['plot', 'script'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={tab === value}
              data-state={tab === value ? 'active' : 'inactive'}
              className={researchSegmentClass(tab === value)}
              onClick={() => setTab(value)}
            >
              {value === 'plot' ? 'Plot' : 'Script'}
            </button>
          ))}
        </ResearchSegmentedTrack>
        <span title={blocked ?? 'Copy the PDF beside the manuscript'}>
          <Button
            size="xs"
            variant="outline"
            disabled={blocked !== null || publishing}
            onClick={() => void publisher.publish(plot)}
          >
            {publishing ? 'Copying…' : 'Use in paper'}
          </Button>
        </span>
        <Button size="xs" variant="ghost" onClick={copyLine}>
          <Copy aria-hidden /> Copy \includegraphics
        </Button>
      </div>
      {state?.run === 'stale' || state?.run === 'not-run' ? (
        <p
          role="status"
          className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2 text-xs text-muted-foreground"
        >
          <span className="size-1.5 shrink-0 rounded-full bg-status-warning" aria-hidden />
          {state.run === 'stale'
            ? 'The script changed since its last run; ask the agent to run it.'
            : 'The script has not run yet; ask the agent to run it.'}
        </p>
      ) : null}
      <div className="scrollbar-sleek min-h-0 flex-1 overflow-auto p-4">
        {!state ? (
          <p role="status" className="text-sm text-muted-foreground">
            Loading…
          </p>
        ) : tab === 'plot' ? (
          <PlotPicture slug={slug} state={state} />
        ) : (
          <div className="flex flex-col gap-4">
            {state.script === null ? (
              <p className="text-xs text-muted-foreground">
                No script: only the files of an earlier run are left.
              </p>
            ) : (
              <pre
                aria-label="Script"
                className="scrollbar-sleek overflow-x-auto rounded-lg border border-border bg-muted/50 p-3 font-mono text-xs leading-relaxed whitespace-pre"
              >
                {state.script}
              </pre>
            )}
            <PlotFindings state={state} />
          </div>
        )}
      </div>
    </section>
  )
}
