import { List } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TabsContent } from '@/components/ui/tabs'
import { ResearchEmptyState, ResearchPageBody } from './ResearchPageLayout'
import { ResearchRunList } from './ResearchRunList'
import type { ExperimentWorkspace } from './research-experiment-workspace-state'
import { ResearchExperimentWorkspaceAttach } from './ResearchExperimentWorkspaceAttach'
import { ResearchExperimentWorkspaceBaseline } from './ResearchExperimentWorkspaceBaseline'
import { ResearchExperimentWorkspaceCompare } from './ResearchExperimentWorkspaceCompare'
import { ResearchExperimentWorkspaceOutputs } from './ResearchExperimentWorkspaceOutputs'

function RunsPage({ workspace }: { workspace: ExperimentWorkspace }): React.JSX.Element | null {
  const { experiment, attach, baseline } = workspace
  if (!experiment) {
    return null
  }
  return (
    <div className="space-y-5">
      {attach.adding && attach.formOwnerId === experiment.id ? (
        <ResearchExperimentWorkspaceAttach
          experiment={experiment}
          runs={workspace.runs}
          attach={attach}
          saving={workspace.saving}
        />
      ) : null}
      {workspace.runs.length ? (
        <div className="space-y-2">
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="xs"
              disabled={workspace.compared.length < 2}
              onClick={() => workspace.setPage('compare')}
            >
              Compare selected ({workspace.compared.length})
            </Button>
          </div>
          <ResearchRunList
            key={experiment.id}
            runs={workspace.runs}
            liveStatuses={workspace.harness.statuses}
            watches={workspace.harness.watches}
            findingsByRun={workspace.findings.byRun}
            summaries={workspace.summaries.byRun}
            selectedRunId={workspace.document?.selectedRunId ?? null}
            markAttached={Boolean(workspace.scope)}
            comparison={{
              checkedIds: workspace.checked.map((run) => run.id),
              lockedId: baseline?.source === 'brief' ? (baseline.run?.id ?? null) : null,
              full: workspace.full,
              onToggle: workspace.toggleComparison
            }}
            onDetach={workspace.detach}
          />
        </div>
      ) : (
        <ResearchEmptyState icon={List} title="No runs yet">
          {workspace.scope
            ? 'Runs appear here when an agent launches them with run exec, or when you attach a metrics file.'
            : 'Attach a metrics file to see its curves.'}
        </ResearchEmptyState>
      )}
    </div>
  )
}

/** The notebook's drill-down pages, inside the Experiment's page tabs: every Run, the
 * comparison, and sample outputs. */
export function ResearchExperimentDetails({
  workspace
}: {
  workspace: ExperimentWorkspace
}): React.JSX.Element {
  const { baseline } = workspace
  const chooseRuns = (): void => workspace.setPage('runs')
  return (
    <>
      {workspace.error && workspace.page !== 'notebook' ? (
        <p role="alert" className="px-6 pt-3 text-sm text-destructive">
          {workspace.error}
        </p>
      ) : null}
      <TabsContent value="runs" className="flex min-h-0 flex-col">
        <ResearchPageBody>
          <RunsPage workspace={workspace} />
        </ResearchPageBody>
      </TabsContent>
      <TabsContent value="compare" className="flex min-h-0 flex-col">
        <ResearchPageBody>
          <ResearchExperimentWorkspaceCompare
            compared={workspace.compared}
            entries={workspace.compare.entries}
            loading={workspace.compare.loading}
            packet={workspace.packet}
            baselineRunId={baseline?.run?.id ?? null}
            runLabel={workspace.runLabel}
            onChooseRuns={chooseRuns}
            baselineControl={
              baseline ? (
                <ResearchExperimentWorkspaceBaseline
                  baseline={baseline}
                  choices={workspace.choices}
                  runLabel={workspace.runLabel}
                  onChange={workspace.chooseBaseline}
                />
              ) : null
            }
          />
        </ResearchPageBody>
      </TabsContent>
      <TabsContent value="outputs" className="flex min-h-0 flex-col">
        <ResearchPageBody>
          <ResearchExperimentWorkspaceOutputs
            compared={workspace.compared}
            baselineRunId={baseline?.run?.id ?? null}
            summaries={workspace.summaries.byRun}
            onChooseRuns={chooseRuns}
          />
        </ResearchPageBody>
      </TabsContent>
    </>
  )
}
