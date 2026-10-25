import { useState } from 'react'
import { GitCompareArrows } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  compareRecordedConditions,
  launchCodeEvidence
} from '../../../../shared/research/research-run-manifest'
import type { ResearchRunRecord } from '../../../../shared/research/research-records'
import { comparabilityNote } from './research-comparability-note'
import { changedConfigKeys } from './research-config-comparison'
import type { ComparedRun } from './research-context-packet'
import { ResearchMetricCurve } from './ResearchMetricCurve'
import { ResearchComparisonTable } from './ResearchComparisonTable'
import { ResearchDetails, ResearchEmptyState } from './ResearchPageLayout'
import { researchErrorText } from './research-error-text'
import { metricGroupLabel } from './research-metric-label'

function SettingsDiff({ entries }: { entries: ComparedRun[] }): React.JSX.Element {
  const keys = changedConfigKeys(entries.map((entry) => entry.config))
  if (!keys.length) {
    return <p className="text-sm text-muted-foreground">No setting differences found.</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="text-muted-foreground">
          <tr>
            <th className="pb-2 font-normal">Setting</th>
            {entries.map(({ run }) => (
              <th className="pb-2 font-normal" key={run.id}>
                {run.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {keys.map((key) => (
            <tr className="border-t border-border" key={key}>
              <th className="py-2 font-mono font-normal">{key}</th>
              {entries.map(({ run, config }) => (
                <td className="py-2 font-mono" key={run.id}>
                  {config?.[key] ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MarkdownSummary({ packet, ready }: { packet: string; ready: boolean }): React.JSX.Element {
  const [copyError, setCopyError] = useState<string | null>(null)
  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(packet)
      setCopyError(null)
    } catch (cause) {
      setCopyError(`Copy failed: ${researchErrorText(cause)}`)
    }
  }
  return (
    <details className="text-xs">
      <summary className="w-fit cursor-pointer select-none rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        Markdown summary
      </summary>
      <div className="mt-2 space-y-2">
        <pre className="scrollbar-sleek max-h-72 overflow-auto rounded-md bg-muted p-3 whitespace-pre-wrap">
          {packet}
        </pre>
        <Button size="xs" variant="outline" disabled={!ready} onClick={() => void copy()}>
          Copy Markdown
        </Button>
        {copyError ? (
          <p role="alert" className="text-destructive">
            {copyError}
          </p>
        ) : null}
      </div>
    </details>
  )
}

/** The compared Runs' metrics, curves, and setting differences, against the baseline. */
export function ResearchExperimentWorkspaceCompare({
  compared,
  entries,
  loading,
  packet,
  baselineRunId,
  baselineControl,
  runLabel,
  onChooseRuns
}: {
  compared: ResearchRunRecord[]
  entries: ComparedRun[]
  loading: boolean
  packet: string
  baselineRunId: string | null
  baselineControl: React.ReactNode
  runLabel: (run: ResearchRunRecord) => string
  onChooseRuns: () => void
}): React.JSX.Element {
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null)
  const [summaryMode, setSummaryMode] = useState<'last' | 'best'>('last')
  if (compared.length < 2) {
    return (
      <ResearchEmptyState
        icon={GitCompareArrows}
        title="Nothing to compare yet"
        action={
          <Button size="sm" variant="outline" onClick={onChooseRuns}>
            Choose runs
          </Button>
        }
      >
        {baselineRunId
          ? 'Check a Run on the Runs tab to compare it with the baseline.'
          : 'Check two or more Runs on the Runs tab.'}
      </ResearchEmptyState>
    )
  }
  const metricNames = [
    ...new Set(
      entries.flatMap(
        (entry) =>
          entry.observation?.events.map((event) => `${event.metric}\u0000${event.split}`) ?? []
      )
    )
  ]
  const activeMetric =
    selectedMetric && metricNames.includes(selectedMetric) ? selectedMetric : metricNames[0]
  const [activeMetricName, activeSplit] = activeMetric?.split('\u0000') ?? []
  const relevant = entries.filter(({ observation }) =>
    observation?.events.some(
      (event) => event.metric === activeMetricName && event.split === activeSplit
    )
  )
  const condition = activeMetricName
    ? compareRecordedConditions(
        relevant.map(({ manifest }) => manifest),
        activeMetricName
      )
    : null
  const axisLabels = [...new Set(entries.map((entry) => entry.observation?.xLabel).filter(Boolean))]
  const curveNote = condition
    ? comparabilityNote(condition, relevant.length < entries.length, { omitUnrecorded: true })
    : null

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {baselineControl}
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={summaryMode}
          onValueChange={(value) => value && setSummaryMode(value === 'best' ? 'best' : 'last')}
          aria-label="Summary"
        >
          <ToggleGroupItem value="last">Last observed</ToggleGroupItem>
          <ToggleGroupItem value="best">Best observed</ToggleGroupItem>
        </ToggleGroup>
      </div>
      {loading ? <p className="text-sm text-muted-foreground">Reading runs…</p> : null}
      {entries.length ? (
        <ResearchComparisonTable
          entries={entries}
          metricNames={metricNames}
          baselineId={baselineRunId}
          summaryMode={summaryMode}
        />
      ) : null}
      {activeMetric ? (
        <section className="space-y-3" aria-label="Curves">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-2xs font-semibold uppercase tracking-widest text-muted-foreground">
              Curves
            </h2>
            {curveNote ? <p className="text-xs text-muted-foreground">{curveNote}</p> : null}
          </div>
          <div className="flex flex-wrap gap-1">
            {metricNames.slice(0, 8).map((group) => (
              <Button
                size="xs"
                key={group}
                variant={activeMetric === group ? 'secondary' : 'ghost'}
                onClick={() => setSelectedMetric(group)}
              >
                {metricGroupLabel(group)}
              </Button>
            ))}
          </div>
          {axisLabels.length === 1 && condition?.condition !== 'different' ? (
            <ResearchMetricCurve
              xLabel={axisLabels[0] ?? 'unknown'}
              valueLabel={metricGroupLabel(activeMetric)}
              series={entries.map(({ run, observation }) => ({
                id: run.id,
                name: runLabel(run),
                events:
                  observation?.events.filter(
                    (event) => event.metric === activeMetricName && event.split === activeSplit
                  ) ?? []
              }))}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              {axisLabels.length > 1
                ? 'No shared curve: the runs use different x-axes.'
                : 'No shared curve: the runs were measured differently.'}
            </p>
          )}
        </section>
      ) : null}
      {entries.length ? (
        <section className="space-y-3" aria-label="Settings">
          <h2 className="text-2xs font-semibold uppercase tracking-widest text-muted-foreground">
            Settings
          </h2>
          <SettingsDiff entries={entries} />
        </section>
      ) : null}
      <div className="space-y-2">
        <MarkdownSummary packet={packet} ready={entries.length > 0} />
        <ResearchDetails
          rows={entries.map(({ run, manifest, manifestError }) => [
            runLabel(run),
            `Code at launch: ${launchCodeEvidence(manifest)}${manifestError ? ` · run.json unavailable: ${manifestError}` : ''}`
          ])}
        />
      </div>
    </div>
  )
}
