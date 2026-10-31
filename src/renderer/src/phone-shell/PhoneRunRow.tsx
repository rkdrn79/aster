import { formatShortTimeAgo } from '@/lib/short-time-ago'
import type { ResearchRunExecutionState } from '../../../shared/research/research-run-manifest'
import { formatRunMetric, type PhoneRunSummary } from './phone-run-summaries'
import { PhoneRow, PhoneStatusPill, type PhoneStatusTone } from './PhoneListLayout'

/** A pill only for states worth a glance; a finished Run reads as finished from its age. */
export function runStatePill(
  state: ResearchRunExecutionState
): { label: string; tone: PhoneStatusTone } | null {
  switch (state) {
    case 'running':
      return { label: 'Running', tone: 'working' }
    case 'failed':
      return { label: 'Failed', tone: 'danger' }
    case 'cancelled':
      return { label: 'Cancelled', tone: 'neutral' }
    case 'succeeded':
    case 'unknown':
      return null
  }
}

export function PhoneRunRow({
  summary,
  now,
  context,
  leading,
  onOpen
}: {
  summary: PhoneRunSummary
  now: number
  /** What the muted line names first: the Experiment, or its project and Experiment. */
  context: string
  /** A glyph for lists that mix Runs with other rows. */
  leading?: React.ReactNode
  onOpen: () => void
}): React.JSX.Element {
  const { run, keyMetric } = summary
  const pill = runStatePill(run.state)
  return (
    <PhoneRow
      onClick={onOpen}
      leading={leading}
      title={run.name || run.id}
      subtitle={[
        context,
        keyMetric ? formatRunMetric(keyMetric) : null,
        summary.at > 0 ? formatShortTimeAgo(summary.at, now) : null
      ]
        .filter(Boolean)
        .join(' · ')}
      trailing={pill ? <PhoneStatusPill tone={pill.tone}>{pill.label}</PhoneStatusPill> : null}
    />
  )
}
