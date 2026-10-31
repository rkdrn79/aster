import { FlaskConical } from 'lucide-react'
import { BRIEF_STATUS_LABELS } from '@/features/research/research-experiment-brief-form'
import { formatMetricValue } from '@/features/research/research-experiment-workspace-summary-format'
import { useDeadlineClock } from '@/features/research/use-deadline-clock'
import type { ResearchExperimentBrief } from '../../../shared/research/research-experiment-brief'
import {
  experimentStanding,
  primaryMetricLabel,
  standingVersusBaseline
} from './phone-experiment-standing'
import {
  usePhoneResearchOverviewRefresh,
  usePhoneResearchOverviews
} from './phone-research-overviews'
import { listPhoneRuns, type PhoneRunSummary } from './phone-run-summaries'
import {
  PhoneEmptyState,
  PhoneRow,
  PhoneScrollBody,
  PhoneSection,
  PhoneSectionNote,
  PhoneStatusPill
} from './PhoneListLayout'
import { PhoneRunRow } from './PhoneRunRow'
import { openPhoneRun } from './PhoneRunsScreen'

/** One labelled line of the brief, wrapped rather than cut, since the words are the point. */
function BriefField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-3">
      <p className="text-[13px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-base leading-snug break-words">{children}</p>
    </div>
  )
}

function BriefSection({
  brief,
  baselineName
}: {
  brief: ResearchExperimentBrief
  /** The baseline Run's name when the catalog lists it; the brief holds only its reference. */
  baselineName: string | null
}): React.JSX.Element {
  const metric = brief.primaryMetric
  return (
    <PhoneSection
      label="Brief"
      trailing={
        <PhoneStatusPill tone={brief.status === 'running' ? 'working' : 'neutral'}>
          {BRIEF_STATUS_LABELS[brief.status]}
        </PhoneStatusPill>
      }
    >
      <BriefField label="Question">{brief.question || 'Not written yet'}</BriefField>
      {brief.hypothesis ? <BriefField label="Hypothesis">{brief.hypothesis}</BriefField> : null}
      {metric ? (
        <BriefField label="Primary metric">
          {`${primaryMetricLabel(metric)} · ${metric.direction === 'maximize' ? 'higher' : 'lower'} is better`}
        </BriefField>
      ) : null}
      {brief.baseline ? (
        <BriefField label="Baseline">{baselineName ?? brief.baseline}</BriefField>
      ) : null}
      {brief.conclusion ? <BriefField label="Conclusion">{brief.conclusion}</BriefField> : null}
    </PhoneSection>
  )
}

/** An Experiment read from the host's catalog: its brief, where it stands, and its Runs. */
export function PhoneExperimentScreen({
  worktreeId,
  slug
}: {
  worktreeId: string
  slug: string
}): React.JSX.Element {
  usePhoneResearchOverviewRefresh([worktreeId])
  const overview = usePhoneResearchOverviews((state) => state.byWorktreeId[worktreeId])
  const now = useDeadlineClock(30_000)
  if (!overview || overview.status !== 'ready') {
    return (
      <PhoneEmptyState
        icon={FlaskConical}
        title={
          overview?.status === 'error' ? 'Couldn’t read the project' : 'Reading the Experiment…'
        }
      >
        {overview?.status === 'error' ? overview.message : null}
      </PhoneEmptyState>
    )
  }
  const { result } = overview
  const experiment = result.experiments.find((entry) => entry.slug === slug)
  if (!experiment) {
    return (
      <PhoneEmptyState icon={FlaskConical} title="Experiment not found">
        Its folder may have moved or been removed on the host.
      </PhoneEmptyState>
    )
  }
  const summaries = listPhoneRuns(worktreeId, result)
  const summaryOf = (experimentSlug: string, runId: string): PhoneRunSummary | undefined =>
    summaries.find((entry) => entry.experimentSlug === experimentSlug && entry.run.id === runId)
  const runs = summaries.filter((entry) => entry.experimentSlug === slug)
  const standing = experimentStanding(experiment, result)
  const versus = standing ? standingVersusBaseline(standing) : null
  const baselineSlug = standing?.baseline?.reference.split('/')[0] ?? ''
  const best = standing?.best ? summaryOf(slug, standing.best.run.id) : undefined
  const baseline = standing?.baseline?.run
    ? summaryOf(baselineSlug, standing.baseline.run.id)
    : undefined
  return (
    <PhoneScrollBody>
      {experiment.brief ? (
        <BriefSection
          brief={experiment.brief}
          baselineName={standing?.baseline?.run?.name || null}
        />
      ) : (
        <PhoneSection label="Brief">
          <PhoneSectionNote>This Experiment has no brief yet</PhoneSectionNote>
        </PhoneSection>
      )}
      {standing && (best || standing.baseline) ? (
        <PhoneSection label="Result">
          {best && standing.best ? (
            <PhoneRow
              onClick={() => openPhoneRun(best)}
              title={best.run.name || best.run.id}
              subtitle={`Best · ${standing.metric} ${formatMetricValue(standing.best.value)}`}
              trailing={
                versus && versus.beats !== null ? (
                  <PhoneStatusPill tone={versus.beats ? 'success' : 'neutral'}>
                    {versus.beats ? 'Beats baseline' : 'Behind baseline'}
                  </PhoneStatusPill>
                ) : null
              }
            />
          ) : null}
          {standing.baseline ? (
            <PhoneRow
              onClick={baseline ? () => openPhoneRun(baseline) : undefined}
              title={standing.baseline.run?.name || standing.baseline.reference}
              subtitle={
                standing.baseline.value === null
                  ? 'Baseline · not measured here yet'
                  : `Baseline · ${standing.metric} ${formatMetricValue(standing.baseline.value)}`
              }
            />
          ) : null}
          {versus ? <PhoneSectionNote>{versus.text}</PhoneSectionNote> : null}
        </PhoneSection>
      ) : null}
      <PhoneSection label="Runs">
        {runs.length === 0 ? <PhoneSectionNote>No Runs recorded yet</PhoneSectionNote> : null}
        {runs.map((summary) => (
          <PhoneRunRow
            key={summary.run.id}
            summary={summary}
            now={now}
            context=""
            onOpen={() => openPhoneRun(summary)}
          />
        ))}
        {experiment.runCount > runs.length ? (
          <PhoneSectionNote>
            The newest {runs.length} of {experiment.runCount} Runs
          </PhoneSectionNote>
        ) : null}
      </PhoneSection>
    </PhoneScrollBody>
  )
}
