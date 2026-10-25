import { Images } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ResearchRunRecord } from '../../../../shared/research/research-records'
import type { ResearchRunSummary } from '../../../../shared/research/research-run-summary'
import { ResearchQualitativeCompare } from './ResearchQualitativeCompare'
import { ResearchMediaCompare } from './ResearchMediaCompare'
import { ResearchEmptyState } from './ResearchPageLayout'
import { summaryMediaTotal } from './research-experiment-workspace-summary-format'
import { catalogRunReference } from './use-research-harness-experiment'

/** Sample ratings (Rate each, A/B, agent judge) and media of the compared Runs. */
export function ResearchExperimentWorkspaceOutputs({
  compared,
  baselineRunId,
  summaries,
  onChooseRuns
}: {
  compared: ResearchRunRecord[]
  baselineRunId: string | null
  summaries: ReadonlyMap<string, ResearchRunSummary | null>
  onChooseRuns: () => void
}): React.JSX.Element {
  if (!compared.length) {
    return (
      <ResearchEmptyState
        icon={Images}
        title="No Runs chosen"
        action={
          <Button size="sm" variant="outline" onClick={onChooseRuns}>
            Choose runs
          </Button>
        }
      >
        Outputs compares the Runs checked on the Runs tab with the baseline.
      </ResearchEmptyState>
    )
  }
  const hasOutputs = compared.some((run) => run.outputsPath)
  const hasMedia = compared.some((run) => {
    const reference = catalogRunReference(run)
    return reference ? summaryMediaTotal(summaries.get(reference)) > 0 : false
  })
  return (
    <div className="min-w-0 space-y-8">
      {!hasOutputs && !hasMedia ? (
        <p className="text-sm text-muted-foreground">
          No outputs.jsonl or media in these Runs yet; training code writes them to the Run folder,
          and media through ASTER_MEDIA lines.
        </p>
      ) : null}
      {hasOutputs ? (
        <ResearchQualitativeCompare runs={compared} baselineRunId={baselineRunId} />
      ) : null}
      <ResearchMediaCompare runs={compared} baselineRunId={baselineRunId} />
    </div>
  )
}
