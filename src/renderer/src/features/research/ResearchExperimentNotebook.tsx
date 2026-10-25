import { ResearchPageBody } from './ResearchPageLayout'
import { ResearchLoopSummary } from './ResearchLoopSummary'
import type { ExperimentWorkspace } from './research-experiment-workspace-state'
import { ResearchExperimentNotebookAnalysis } from './ResearchExperimentNotebookAnalysis'
import { ResearchExperimentNotebookConclusion } from './ResearchExperimentNotebookConclusion'
import { ResearchExperimentNotebookNeedsYou } from './ResearchExperimentNotebookNeedsYou'
import { ResearchExperimentNotebookPlan } from './ResearchExperimentNotebookPlan'
import { ResearchExperimentNotebookResults } from './ResearchExperimentNotebookResults'
import { ResearchEvidenceCheck } from './ResearchEvidenceCheck'

/**
 * The Experiment's notebook (ADR-003): plan, what needs a decision, results, the agent's analyses,
 * and the conclusion, in one readable column. Details drill down from its items.
 */
export function ResearchExperimentNotebook({
  workspace
}: {
  workspace: ExperimentWorkspace
}): React.JSX.Element {
  return (
    <ResearchPageBody>
      <div className="mx-auto w-full max-w-3xl space-y-10 pb-10">
        {workspace.error ? (
          <p role="alert" className="text-sm text-destructive">
            {workspace.error}
          </p>
        ) : null}
        <ResearchExperimentNotebookPlan workspace={workspace} />
        {workspace.experiment && workspace.scope ? (
          <ResearchEvidenceCheck
            key={`${workspace.experiment.id}:${workspace.scope.workspacePath}`}
            scope={workspace.scope}
          />
        ) : null}
        <ResearchExperimentNotebookNeedsYou workspace={workspace} />
        <ResearchExperimentNotebookResults workspace={workspace} />
        {workspace.harness.loop ? (
          <ResearchLoopSummary
            ledger={workspace.harness.loop}
            running={workspace.runs.some((run) => workspace.statusOf(run).state === 'running')}
          />
        ) : null}
        <ResearchExperimentNotebookAnalysis workspace={workspace} />
        <ResearchExperimentNotebookConclusion workspace={workspace} />
      </div>
    </ResearchPageBody>
  )
}
