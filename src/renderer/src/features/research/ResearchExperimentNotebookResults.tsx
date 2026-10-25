import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { ResearchRunRecord } from '../../../../shared/research/research-records'
import { readResearchTextFile } from './research-file-reader'
import {
  configSeedKey,
  notebookResultRows,
  runSummaryOf
} from './research-experiment-notebook-results'
import type { ExperimentWorkspace } from './research-experiment-workspace-state'
import {
  summaryMetricLabel,
  type SummaryValueMode
} from './research-experiment-workspace-summary-format'
import {
  formatDeltaInColumn,
  formatMetricInColumn,
  formatSpreadInColumn
} from './research-metric-column-format'
import { NotebookSection } from './ResearchExperimentNotebookLayout'
import { ResearchRunStatusLine } from './ResearchRunStatusLine'

const SHOWN = 8
const NO_KEYS = new Map<string, string | null>()

/**
 * Each Run's config.json identity apart from the seed, so seeds share a Results row. Read once per
 * set of Runs; a Run without a readable config stays on its own row.
 */
function useConfigSeedKeys(runs: readonly ResearchRunRecord[]): ReadonlyMap<string, string | null> {
  const key = runs.map((run) => `${run.id}:${run.configPath ?? ''}`).join(',')
  const [loaded, setLoaded] = useState<{ key: string; keys: Map<string, string | null> } | null>(
    null
  )
  useEffect(() => {
    let active = true
    const withConfig = runs.filter((run) => run.configPath)
    void Promise.all(
      withConfig.map(async (run): Promise<[string, string | null]> => {
        const content = await readResearchTextFile(run, run.configPath ?? '').catch(() => null)
        return [run.id, content === null ? null : configSeedKey(content)]
      })
    ).then((entries) => {
      if (active) {
        setLoaded({ key, keys: new Map(entries) })
      }
    })
    return () => {
      active = false
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- the Run list is rebuilt on every store write; only its IDs and config paths decide a reread.
  }, [key])
  return loaded?.key === key ? loaded.keys : NO_KEYS
}

/** Each Run, or each config over its seeds, against the baseline on the primary metric. */
export function ResearchExperimentNotebookResults({
  workspace
}: {
  workspace: ExperimentWorkspace
}): React.JSX.Element | null {
  const [mode, setMode] = useState<SummaryValueMode>('last')
  const { runs, statusOf, baseline, summaries } = workspace
  const configKeys = useConfigSeedKeys(runs)
  const summaryOf = useMemo(() => runSummaryOf(summaries.byRun), [summaries.byRun])
  const baselineRunId = baseline?.run?.id ?? null
  const baselineReference = baseline?.reference ?? null
  const table = useMemo(
    () =>
      notebookResultRows({
        runs,
        statusOf,
        summaryOf,
        configKeyOf: (run) => configKeys.get(run.id) ?? null,
        baselineRunId,
        baselineReference,
        mode
      }),
    [runs, statusOf, summaryOf, configKeys, baselineRunId, baselineReference, mode]
  )
  if (!workspace.experiment) {
    return null
  }
  const metric = summaryMetricLabel(runs.map(summaryOf))
  const showDelta = Boolean(metric && baselineReference)
  const baselineName = baseline?.run?.name ?? baseline?.reference
  const rows = table.rows.slice(0, SHOWN)
  const decimals = workspace.metricDecimals
  return (
    <NotebookSection
      label="Results"
      action={
        metric ? (
          <ToggleGroup
            type="single"
            variant="outline"
            size="xs"
            value={mode}
            onValueChange={(value) => value && setMode(value === 'best' ? 'best' : 'last')}
            aria-label="Primary metric value"
          >
            <ToggleGroupItem value="last">Last</ToggleGroupItem>
            <ToggleGroupItem value="best">Best</ToggleGroupItem>
          </ToggleGroup>
        ) : null
      }
    >
      {runs.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th className="py-1.5 pr-3 font-normal">Run</th>
                <th className="py-1.5 pr-3 font-normal">State</th>
                {metric ? (
                  <th
                    className="py-1.5 pr-3 text-right font-normal"
                    title={metric.direction === 'maximize' ? 'Higher is better' : 'Lower is better'}
                  >
                    {metric.label} {metric.direction === 'maximize' ? '↑' : '↓'}
                  </th>
                ) : null}
                {showDelta ? (
                  <th className="py-1.5 pr-3 text-right font-normal">vs {baselineName}</th>
                ) : null}
                {table.grouped ? <th className="py-1.5 text-right font-normal">Seeds</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.key}
                  className="cursor-pointer border-b border-border/60 hover:bg-accent"
                  onClick={() => workspace.openRun(row.lead.id)}
                >
                  <td className="max-w-64 py-1.5 pr-3">
                    <button
                      type="button"
                      className="max-w-full truncate rounded-sm text-left font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={(event) => {
                        event.stopPropagation()
                        workspace.openRun(row.lead.id)
                      }}
                    >
                      {row.name}
                    </button>
                  </td>
                  <td className="py-1.5 pr-3 text-xs text-muted-foreground">
                    <ResearchRunStatusLine facts={statusOf(row.lead)} />
                  </td>
                  {metric ? (
                    <td
                      className="py-1.5 pr-3 text-right font-mono tabular-nums"
                      title={row.step !== null ? `step ${row.step}` : undefined}
                    >
                      {row.value === null ? '—' : formatMetricInColumn(row.value, decimals)}
                      {row.spread !== null ? (
                        <span className="text-muted-foreground">
                          {' '}
                          {formatSpreadInColumn(row.spread, decimals)}
                        </span>
                      ) : null}
                    </td>
                  ) : null}
                  {showDelta ? (
                    <td className="py-1.5 pr-3 text-right font-mono tabular-nums text-muted-foreground">
                      {row.isBaseline
                        ? 'baseline'
                        : row.delta === null
                          ? '—'
                          : formatDeltaInColumn(row.delta, decimals)}
                    </td>
                  ) : null}
                  {table.grouped ? (
                    <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                      {row.seeds}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-muted-foreground">
            {workspace.scope
              ? 'No Runs yet. They appear here when an agent launches them with run exec.'
              : 'No Runs yet.'}
          </p>
          <Button size="xs" variant="ghost" onClick={workspace.openAttach}>
            Attach run
          </Button>
        </div>
      )}
      {runs.length > rows.length ? (
        <Button size="xs" variant="ghost" onClick={() => workspace.setPage('runs')}>
          All {runs.length} Runs
        </Button>
      ) : null}
    </NotebookSection>
  )
}
