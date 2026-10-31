import { useState } from 'react'
import { FileWarning, RefreshCw } from 'lucide-react'
import { formatMetricValue } from '@/features/research/research-experiment-workspace-summary-format'
import { useDeadlineClock } from '@/features/research/use-deadline-clock'
import { getIntlLocale } from '@/i18n/i18n'
import type {
  ResearchProjectMetricSeries,
  ResearchProjectRunLogTailResult
} from '../../../shared/research/research-project-api'
import { runStateLabel } from './phone-run-summaries'
import {
  PhoneEmptyState,
  PhoneScrollBody,
  PhoneSection,
  PhoneSectionNote,
  PhoneStatusPill
} from './PhoneListLayout'
import { runStatePill } from './PhoneRunRow'
import { usePhoneRunDetail, type PhoneRunRef } from './use-phone-run-detail'

const LOG_LINES_COLLAPSED = 20

function bestValue(series: ResearchProjectMetricSeries): number | null {
  if (series.points.length === 0 || !series.direction) {
    return null
  }
  const values = series.points.map((point) => point.value)
  return series.direction === 'maximize' ? Math.max(...values) : Math.min(...values)
}

function formatStartTime(epochMs: number): string {
  return new Date(epochMs).toLocaleString(getIntlLocale(), {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) {
    return `${minutes}m`
  }
  const hours = Math.floor(minutes / 60)
  return hours < 48 ? `${hours}h ${minutes % 60}m` : `${Math.floor(hours / 24)}d ${hours % 24}h`
}

function MetricCell({ series }: { series: ResearchProjectMetricSeries }): React.JSX.Element {
  const last = series.points.at(-1)
  const best = bestValue(series)
  return (
    <div className="min-w-0 px-4 py-3.5">
      <p className="truncate text-xs text-muted-foreground">
        {series.split ? `${series.split} ${series.name}` : series.name}
      </p>
      <p className="mt-0.5 text-2xl leading-tight font-semibold tabular-nums">
        {last ? formatMetricValue(last.value) : '—'}
      </p>
      <p className="mt-0.5 truncate text-xs text-muted-foreground tabular-nums">
        {[
          best !== null && last && best !== last.value ? `best ${formatMetricValue(best)}` : null,
          last?.step !== null && last?.step !== undefined ? `step ${last.step}` : null
        ]
          .filter(Boolean)
          .join(' · ') || `${series.count} points`}
      </p>
    </div>
  )
}

function LogTail({
  log,
  error
}: {
  log: ResearchProjectRunLogTailResult | null
  error: string | null
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  if (error && !log) {
    return <PhoneSectionNote>{error}</PhoneSectionNote>
  }
  const lines = (log?.status === 'present' ? log.text : '').replace(/\n+$/, '').split('\n')
  if (lines.length === 0 || (lines.length === 1 && !lines[0])) {
    return <PhoneSectionNote>No log written yet</PhoneSectionNote>
  }
  const hidden = expanded ? 0 : Math.max(0, lines.length - LOG_LINES_COLLAPSED)
  return (
    <div className="bg-editor-surface">
      <pre className="px-4 py-3 font-mono text-xs leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">
        {lines.slice(hidden).join('\n')}
      </pre>
      {hidden > 0 || expanded ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="flex h-11 w-full items-center justify-center border-t border-border text-[13px] font-medium text-foreground active:bg-accent"
        >
          {expanded ? 'Show less' : `Show ${hidden} earlier lines`}
        </button>
      ) : null}
    </div>
  )
}

/** One Run from the host: where it stands, its metrics, and the end of its log. */
export function PhoneRunDetailScreen({ runRef }: { runRef: PhoneRunRef }): React.JSX.Element {
  const detail = usePhoneRunDetail(runRef)
  const now = useDeadlineClock(30_000)
  const manifest = detail.run?.manifest.status === 'present' ? detail.run.manifest.value : null
  const metrics = detail.run?.metrics.status === 'present' ? detail.run.metrics.value : null
  if (!detail.run && detail.runError) {
    return (
      <PhoneEmptyState icon={FileWarning} title="Run could not be read">
        {detail.runError}
      </PhoneEmptyState>
    )
  }
  const state = manifest?.execution?.state ?? 'unknown'
  const pill = runStatePill(state)
  const startedAt = manifest?.launch?.startedAt ? Date.parse(manifest.launch.startedAt) : null
  const finishedAt = manifest?.launch?.finishedAt ? Date.parse(manifest.launch.finishedAt) : null
  const exitCode = manifest?.execution?.exitCode
  const facts = [
    startedAt ? formatStartTime(startedAt) : null,
    startedAt ? formatDuration((finishedAt ?? now) - startedAt) : null,
    exitCode !== undefined && exitCode !== null && exitCode !== 0 ? `exit ${exitCode}` : null,
    manifest?.launch?.host ?? null
  ].filter(Boolean)
  return (
    <PhoneScrollBody>
      <div className="px-8 pt-5">
        <div className="flex items-center gap-2">
          {pill ? (
            <PhoneStatusPill tone={pill.tone}>{pill.label}</PhoneStatusPill>
          ) : (
            <span className="text-[15px] font-medium">{runStateLabel(state)}</span>
          )}
          {detail.loading ? (
            <span className="ml-auto text-xs text-muted-foreground">Reading…</span>
          ) : null}
        </div>
        <p className="mt-2 text-[13px] text-muted-foreground tabular-nums">
          {manifest ? facts.join(' · ') : 'No run.json for this Run yet'}
        </p>
        {manifest?.command ? (
          <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
            {manifest.command}
          </p>
        ) : null}
      </div>
      <PhoneSection label={metrics?.partial ? 'Metrics (newest rows)' : 'Metrics'}>
        {metrics && metrics.series.length > 0 ? (
          <div className="grid grid-cols-2 [&>*]:border-border [&>*:nth-child(n+3)]:border-t [&>*:nth-child(odd):not(:last-child)]:border-r [&>*:nth-child(odd):last-child]:col-span-2">
            {metrics.series.map((series) => (
              <MetricCell key={`${series.split ?? ''}/${series.name}`} series={series} />
            ))}
          </div>
        ) : (
          <PhoneSectionNote>No metrics recorded yet</PhoneSectionNote>
        )}
      </PhoneSection>
      <PhoneSection
        label={detail.log?.path ? (detail.log.path.split('/').at(-1) ?? 'Log') : 'Log'}
        trailing={
          <button
            type="button"
            onClick={detail.refresh}
            disabled={detail.loading}
            className="-my-3 -mr-2 flex h-11 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-foreground active:bg-accent disabled:opacity-50"
          >
            <RefreshCw className="size-3.5" aria-hidden />
            Refresh
          </button>
        }
      >
        <LogTail log={detail.log} error={detail.logError} />
      </PhoneSection>
    </PhoneScrollBody>
  )
}
