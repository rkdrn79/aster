import { compareRecordedConditions } from '../../../../shared/research/research-run-manifest'
import type { ComparedRun } from './research-context-packet'
import { observedMetricValue } from './research-metric-summary'
import { comparabilityNote, unrecordedConditionsNote } from './research-comparability-note'
import { metricGroupLabel } from './research-metric-label'
import {
  formatDeltaInColumn,
  formatMetricInColumn,
  metricColumnDecimals
} from './research-metric-column-format'

export function ResearchComparisonTable({
  entries,
  metricNames,
  baselineId,
  summaryMode
}: {
  entries: ComparedRun[]
  metricNames: string[]
  baselineId: string | null
  summaryMode: 'last' | 'best'
}): React.JSX.Element {
  const rows = metricNames.map((group) => {
    const [metric, split] = group.split('\u0000')
    const relevant = entries.filter(({ observation }) =>
      observation?.events.some((event) => event.metric === metric && event.split === split)
    )
    const condition = compareRecordedConditions(
      relevant.map(({ manifest }) => manifest),
      metric
    )
    const cells = entries.map(({ run, observation, manifest }) => {
      const values =
        observation?.events.filter((event) => event.metric === metric && event.split === split) ??
        []
      const definition = manifest?.metrics?.definitions?.[metric]
      return {
        run,
        unit: definition?.unit,
        bestUnknown: values.length > 0 && summaryMode === 'best' && !definition?.direction,
        value: observedMetricValue(values, summaryMode, definition?.direction)
      }
    })
    return {
      group,
      condition,
      cells,
      note: comparabilityNote(condition, relevant.length < entries.length, {
        omitUnrecorded: true
      }),
      // Why: one precision per row, so 27.09 and 27.4922 never sit side by side.
      decimals: metricColumnDecimals(cells.flatMap((cell) => cell.value ?? []))
    }
  })
  const tableNote = unrecordedConditionsNote(rows.map((row) => row.condition))
  const hasBaseline = entries.some(({ run }) => run.id === baselineId)

  return (
    <div className="space-y-1.5">
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-xl text-left text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="p-3">
                Metric · {summaryMode === 'last' ? 'last observed' : 'best observed'}
              </th>
              {entries.map(({ run }) => (
                <th key={run.id} className="p-3">
                  {run.name}
                  {run.id === baselineId ? (
                    ' · baseline'
                  ) : hasBaseline ? (
                    <span className="block text-2xs font-normal text-muted-foreground">
                      value · Δ vs baseline
                    </span>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ group, condition, cells, note, decimals }) => {
              const baseline = cells.find((cell) => cell.run.id === baselineId)?.value ?? null
              return (
                <tr key={group} className="border-t border-border">
                  <th className="p-3 font-mono font-medium">
                    {metricGroupLabel(group)}
                    {note ? (
                      <span className="mt-1 block font-sans text-xs font-normal text-muted-foreground">
                        {note}
                      </span>
                    ) : null}
                  </th>
                  {cells.map(({ run, unit, value, bestUnknown }) => (
                    <td
                      key={run.id}
                      className="p-3 font-mono tabular-nums"
                      title={bestUnknown ? 'Better direction not recorded' : undefined}
                    >
                      {value === null ? '—' : formatMetricInColumn(value, decimals)}
                      {value !== null && unit ? ` ${unit}` : ''}
                      {value !== null &&
                      baseline !== null &&
                      run.id !== baselineId &&
                      condition.condition !== 'different' ? (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {formatDeltaInColumn(value - baseline, decimals)}
                        </span>
                      ) : null}
                    </td>
                  ))}
                </tr>
              )
            })}
            {entries.some(({ error, observation }) => error || observation?.errorRows) ? (
              <tr className="border-t border-border">
                <th className="p-3">Problems</th>
                {entries.map(({ run, error, observation }) => (
                  <td key={run.id} className="p-3 text-xs text-muted-foreground">
                    {error ??
                      (observation?.errorRows ? `${observation.errorRows} unreadable rows` : null)}
                  </td>
                ))}
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {tableNote ? <p className="text-xs text-muted-foreground">{tableNote}</p> : null}
    </div>
  )
}
