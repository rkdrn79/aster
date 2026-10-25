import type { ResearchFinding } from '../../../../shared/research/research-quality-findings'
import type { ExperimentRecord } from '../../../../shared/research/research-records'
import { ResearchAskExperimentAgent } from './ResearchExperimentAgentPane'
import { useExperimentAgentPolicy } from './research-agent-review-policy'
import { harnessExperimentSlug } from './use-research-harness-experiment'

/** "Ask agent" (triage) on an open warning or failure, unless the brief turned triage off. */
export function ResearchFindingAgentActions({
  experiment,
  finding
}: {
  experiment: ExperimentRecord
  finding: ResearchFinding
}): React.JSX.Element | null {
  const policy = useExperimentAgentPolicy(experiment)
  const slug = harnessExperimentSlug(experiment)
  if (
    !slug ||
    !policy ||
    policy.triage === 'off' ||
    finding.status !== 'open' ||
    finding.severity === 'info'
  ) {
    return null
  }
  return <ResearchAskExperimentAgent experiment={experiment} target={{ kind: 'triage', finding }} />
}
