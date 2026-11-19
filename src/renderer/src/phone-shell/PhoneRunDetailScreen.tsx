import { FileWarning, RefreshCw } from 'lucide-react'
import { useDeadlineClock } from '@/features/research/use-deadline-clock'
import { getIntlLocale } from '@/i18n/i18n'
import { runStateLabel } from './phone-run-summaries'
import { PhoneEmptyState, PhoneScrollBody, PhoneSection, PhoneStatusPill } from './PhoneListLayout'
import { PhoneRunLog } from './PhoneRunLog'
import { PhoneRunMedia } from './PhoneRunMedia'
import { PhoneRunMetrics } from './PhoneRunMetrics'
import { runStatePill } from './PhoneRunRow'
import { usePhoneRunDetail, type PhoneRunRef } from './use-phone-run-detail'

function formatStartTime(epochMs: number): string {
  return new Date(epochMs).toLocaleString(getIntlLocale(), {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  if (seconds < 3600) {
    // Why seconds: a Run that just started should visibly tick, not sit at "0m".
    return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  }
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  return hours < 48 ? `${hours}h ${minutes % 60}m` : `${Math.floor(hours / 24)}d ${hours % 24}h`
}

/** One Run from the host: where it stands, its metrics, and the end of its log. */
export function PhoneRunDetailScreen({ runRef }: { runRef: PhoneRunRef }): React.JSX.Element {
  const detail = usePhoneRunDetail(runRef)
  // Why 1 s while live: the elapsed time is the first thing checked on a running Run.
  const now = useDeadlineClock(detail.live ? 1_000 : 30_000)
  const manifest = detail.run?.manifest.status === 'present' ? detail.run.manifest.value : null
  const metrics = detail.run?.metrics.status === 'present' ? detail.run.metrics.value : null
  const media = detail.run?.media.status === 'present' ? detail.run.media.value : null
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
          ) : detail.live ? (
            <span className="ml-auto text-xs text-muted-foreground">Updates every 5 s</span>
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
        <PhoneRunMetrics series={metrics?.series ?? []} />
      </PhoneSection>
      {media && media.items.length > 0 ? (
        <PhoneSection label="Images and samples">
          <PhoneRunMedia
            worktreeId={runRef.worktreeId}
            items={media.items}
            truncated={media.truncated}
          />
        </PhoneSection>
      ) : null}
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
        <PhoneRunLog log={detail.log} error={detail.logError} />
      </PhoneSection>
    </PhoneScrollBody>
  )
}
