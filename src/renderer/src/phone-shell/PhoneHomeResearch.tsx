import { getIntlLocale } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import {
  deadlineTone,
  formatDayCount,
  formatDeadlineDateTime,
  systemTimeZone
} from '@/features/research/research-deadline-format'
import { usePhoneHostResearch } from './phone-host-research-reads'
import {
  computeJobDetail,
  computeJobPill,
  computeQueueSummary,
  nextPhoneDeadlines,
  phoneComputeJobs
} from './phone-host-research-summary'
import { PhoneRow, PhoneSection, PhoneSectionNote, PhoneStatusPill } from './PhoneListLayout'

const JOBS_SHOWN = 3

/** The next deadlines this host tracks; nothing at all when it tracks none or cannot say. */
export function PhoneDeadlinesSection({ now }: { now: number }): React.JSX.Element | null {
  const read = usePhoneHostResearch((state) => state.deadlines)
  const entries = read?.status === 'ready' ? nextPhoneDeadlines(read.result.upcoming, now) : []
  if (entries.length === 0) {
    return null
  }
  const timeZone = systemTimeZone()
  const locale = getIntlLocale()
  return (
    <PhoneSection label="Deadlines">
      {entries.map((entry) => {
        const at = Date.parse(entry.at)
        const tone = deadlineTone(at, now)
        return (
          <PhoneRow
            key={`${entry.editionId ?? entry.conference}/${entry.label}/${entry.at}`}
            title={entry.conference}
            subtitle={`${entry.label} · ${formatDeadlineDateTime(at, timeZone, locale)}`}
            trailing={
              <span
                className={cn(
                  'text-[15px] tabular-nums text-muted-foreground',
                  tone === 'urgent' && 'font-semibold text-destructive',
                  tone === 'soon' && 'font-semibold text-foreground'
                )}
              >
                {formatDayCount(at, now)}
              </span>
            }
          />
        )
      })}
    </PhoneSection>
  )
}

/** This host's SLURM queue; absent on a host without SLURM, so most laptops show nothing. */
export function PhoneComputeSection(): React.JSX.Element | null {
  const read = usePhoneHostResearch((state) => state.compute)
  if (read?.status !== 'ready' || read.result.slurm.status === 'absent') {
    return null
  }
  const { slurm, budget, hostname } = read.result
  if (slurm.status === 'unreadable') {
    return (
      <PhoneSection label={`Compute · ${hostname}`}>
        <PhoneSectionNote>SLURM didn’t answer: {slurm.reason}</PhoneSectionNote>
      </PhoneSection>
    )
  }
  const { jobs, omittedJobs } = slurm.value
  const shown = phoneComputeJobs(jobs).slice(0, JOBS_SHOWN)
  const more = jobs.length - shown.length + omittedJobs
  return (
    <PhoneSection label={`Compute · ${hostname}`}>
      <PhoneRow
        title={jobs.length === 0 ? 'No jobs in the queue' : 'Your GPU jobs'}
        subtitle={computeQueueSummary(jobs, budget.status === 'present' ? budget.value : null)}
      />
      {shown.map((job) => {
        const pill = computeJobPill(job)
        return (
          <PhoneRow
            key={job.id}
            title={job.name || `Job ${job.id}`}
            subtitle={computeJobDetail(job)}
            trailing={<PhoneStatusPill tone={pill.tone}>{pill.label}</PhoneStatusPill>}
          />
        )
      })}
      {more > 0 ? <PhoneSectionNote>{more} more in the queue</PhoneSectionNote> : null}
    </PhoneSection>
  )
}
