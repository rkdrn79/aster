import { formatMetricValue } from '@/features/research/research-experiment-workspace-summary-format'
import type {
  ResearchProjectExperimentOverview,
  ResearchProjectReadResult
} from '../../../shared/research/research-project-api'
import { experimentStanding } from './phone-experiment-standing'
import { usePhoneNavigation } from './phone-navigation-store'
import { PhoneRow, PhoneSectionNote } from './PhoneListLayout'

/** "val acc · best 0.612 · 3 Runs"; parts the catalog lacks stay out. */
export function experimentMeta(
  experiment: ResearchProjectExperimentOverview,
  result: Pick<ResearchProjectReadResult, 'experiments'>
): string {
  const standing = experimentStanding(experiment, result)
  const runs = `${experiment.runCount} ${experiment.runCount === 1 ? 'Run' : 'Runs'}`
  return [
    standing?.metric ?? null,
    standing?.best ? `best ${formatMetricValue(standing.best.value)}` : null,
    runs
  ]
    .filter(Boolean)
    .join(' · ')
}

/** A project's Experiments from its `.aster/` catalog; each opens its read-only brief and Runs. */
export function PhoneExperimentRows({
  worktreeId,
  projectName,
  result
}: {
  worktreeId: string
  projectName: string
  result: ResearchProjectReadResult
}): React.JSX.Element {
  if (result.experiments.length === 0) {
    return <PhoneSectionNote>No Experiments recorded yet</PhoneSectionNote>
  }
  return (
    <>
      {result.experiments.map((experiment) => {
        const name = experiment.name || experiment.slug
        return (
          <PhoneRow
            key={experiment.slug}
            data-phone-experiment-row={experiment.slug}
            onClick={() =>
              usePhoneNavigation.getState().push({
                kind: 'experiment',
                worktreeId,
                experiment: experiment.slug,
                title: name,
                subtitle: projectName
              })
            }
            title={name}
            subtitle={
              <>
                {experiment.brief?.question ? (
                  <span className="block truncate">{experiment.brief.question}</span>
                ) : null}
                <span className="block truncate">{experimentMeta(experiment, result)}</span>
              </>
            }
          />
        )
      })}
    </>
  )
}
