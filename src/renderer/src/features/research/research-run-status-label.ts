import type { ResearchRunRecord } from '../../../../shared/research/research-records'
import type { ResearchRunManifest } from '../../../../shared/research/research-run-manifest'
import type { ResearchHarnessRunStatus } from '../../../../shared/research/research-harness-results'

const STATUS_LABELS: Record<ResearchRunRecord['execution'], string> = {
  unknown: 'Status unknown',
  running: 'Running',
  succeeded: 'Succeeded',
  failed: 'Failed',
  cancelled: 'Cancelled'
}

/** How a Run's recorded status reads to a researcher. */
export function researchRunStatusLabel(execution: ResearchRunRecord['execution']): string {
  return STATUS_LABELS[execution]
}

/** What a launcher recorded about a Run's process, from run.json or the harness. */
export type ResearchRunStatusFacts = {
  state: ResearchRunRecord['execution']
  exitCode?: number | null
  startedAt?: string | null
  durationMs?: number | null
  signal?: string | null
  /** Same-host check of the launcher process; `exited` means nobody will record the end. */
  liveness?: ResearchHarnessRunStatus['liveness']
}

export type ResearchRunStatusTone = ResearchRunRecord['execution'] | 'stalled'

/** `45s`, `3m 20s`, `2h 5m`; coarse drops seconds past the first minute for live counters. */
export function formatRunDuration(milliseconds: number, coarse = false): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000))
  if (seconds < 60) {
    return `${seconds}s`
  }
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) {
    return coarse || seconds % 60 === 0 ? `${minutes}m` : `${minutes}m ${seconds % 60}s`
  }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return minutes % 60 === 0 ? `${hours}h` : `${hours}h ${minutes % 60}m`
  }
  const days = Math.floor(hours / 24)
  return hours % 24 === 0 ? `${days}d` : `${days}d ${hours % 24}h`
}

/** A calm one-line status such as `Running · 12m` or `Failed · exit 1`. */
export function researchRunStatusSummary(
  facts: ResearchRunStatusFacts,
  now: number
): { label: string; tone: ResearchRunStatusTone } {
  const { state } = facts
  if (state === 'running') {
    if (facts.liveness === 'exited') {
      return { label: 'Running · launcher exited', tone: 'stalled' }
    }
    const started = facts.startedAt ? Date.parse(facts.startedAt) : Number.NaN
    return {
      label: Number.isFinite(started)
        ? `Running · ${formatRunDuration(now - started, true)}`
        : 'Running',
      tone: 'running'
    }
  }
  if (state === 'succeeded') {
    return {
      label:
        typeof facts.durationMs === 'number'
          ? `Succeeded · ${formatRunDuration(facts.durationMs)}`
          : 'Succeeded',
      tone: 'succeeded'
    }
  }
  if (state === 'failed') {
    const detail =
      typeof facts.exitCode === 'number'
        ? `exit ${facts.exitCode}`
        : facts.signal
          ? facts.signal
          : null
    return { label: detail ? `Failed · ${detail}` : 'Failed', tone: 'failed' }
  }
  return { label: STATUS_LABELS[state], tone: state }
}

export function runStatusFactsFromManifest(manifest: ResearchRunManifest): ResearchRunStatusFacts {
  const launch = manifest.launch
  const started = launch?.startedAt ? Date.parse(launch.startedAt) : Number.NaN
  const finished = launch?.finishedAt ? Date.parse(launch.finishedAt) : Number.NaN
  return {
    state: manifest.execution?.state ?? 'unknown',
    exitCode: manifest.execution?.exitCode ?? null,
    startedAt: launch?.startedAt ?? null,
    durationMs:
      launch?.durationMs ??
      (Number.isFinite(started) && Number.isFinite(finished) ? finished - started : null),
    signal: launch?.signal ?? null
  }
}

/** Live facts win unless the researcher set the status by hand. */
export function effectiveRunStatusFacts(
  run: Pick<ResearchRunRecord, 'execution' | 'reportedBy'>,
  live: ResearchRunStatusFacts | null | undefined
): ResearchRunStatusFacts {
  return live && run.reportedBy !== 'user' ? live : { state: run.execution }
}
