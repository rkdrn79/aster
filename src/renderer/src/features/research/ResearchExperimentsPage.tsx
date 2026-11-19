import { useEffect, useMemo, useState } from 'react'
import { FlaskConical, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAppStore } from '@/store'
import { LOCAL_EXECUTION_HOST_ID, parseExecutionHostId } from '../../../../shared/execution-host'
import type { ExperimentRecord } from '../../../../shared/research/research-records'
import { selectResearchExperiment } from '../../../../shared/research/research-selection'
import { cn } from '@/lib/utils'
import { RAISED_CARD } from './research-surface-classes'
import { ResearchEmptyState, ResearchPageBody, ResearchPageHeader } from './ResearchPageLayout'
import { useResearchActiveProject } from './research-home-projects'
import { openResearchExperimentPage } from './research-experiment-page'
import { useResearchRecords } from './research-records-store'
import { useDeleteResearchExperiment } from './research-experiment-delete'
import { ResearchPlanView } from './ResearchPlanView'
import { useResearchPlan } from './use-research-plan'

type ExperimentsTab = 'experiments' | 'plan'

export function ResearchExperimentsPage(): React.JSX.Element {
  const { project, workspace } = useResearchActiveProject()
  const [tab, setTab] = useState<ExperimentsTab>('experiments')
  // Why local only: plans are read and approved through the local harness, like proposals.
  const planPath =
    workspace && (workspace.executionHostId ?? LOCAL_EXECUTION_HOST_ID) === LOCAL_EXECUTION_HOST_ID
      ? workspace.path
      : null
  const plan = useResearchPlan(planPath)
  const document = useResearchRecords((state) => state.document)
  const loading = useResearchRecords((state) => state.loading)
  const error = useResearchRecords((state) => state.error)
  const [query, setQuery] = useState('')
  const deleteExperiment = useDeleteResearchExperiment()

  useEffect(() => {
    void useResearchRecords.getState().load()
  }, [])

  const experiments = useMemo(() => {
    if (!document || !project) {
      return []
    }
    return document.experiments
      .filter((experiment) =>
        project.workspaces.some(
          (workspace) =>
            workspace.id === experiment.workspaceId &&
            (!workspace.executionHostId || workspace.executionHostId === experiment.hostId)
        )
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }, [document, project])
  const visibleExperiments = experiments.filter((experiment) =>
    experiment.name.toLowerCase().includes(query.trim().toLowerCase())
  )

  async function openExperiment(experiment: ExperimentRecord) {
    try {
      await useResearchRecords.getState().update((current) =>
        selectResearchExperiment(
          {
            ...current,
            selectedExperimentByWorkspace: {
              ...current.selectedExperimentByWorkspace,
              [JSON.stringify([experiment.hostId, experiment.workspaceId])]: experiment.id
            }
          },
          experiment.id
        )
      )
      const host = parseExecutionHostId(experiment.hostId)
      if (host) {
        useAppStore.getState().setActiveWorktree(experiment.workspaceId, host.id)
      }
      openResearchExperimentPage(experiment.id, 'notebook')
    } catch {
      // The record store keeps save failures visible on this page.
    }
  }

  return (
    <section
      className="flex min-h-0 flex-1 flex-col bg-background text-foreground"
      aria-label="Experiments"
    >
      <ResearchPageHeader
        title="Experiments"
        context={project?.name}
        actions={
          <>
            {tab === 'experiments' && (experiments.length > 5 || query) ? (
              <Input
                density="compact"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find experiments"
                aria-label="Find experiments"
              />
            ) : null}
            <Tabs
              value={tab}
              onValueChange={(value) => setTab(value === 'plan' ? 'plan' : 'experiments')}
            >
              <TabsList aria-label="Experiments or plan">
                <TabsTrigger value="experiments">Experiments</TabsTrigger>
                <TabsTrigger value="plan">
                  Plan
                  {plan.overview && plan.overview.plan.status === 'submitted' ? (
                    <span
                      className="size-1.5 rounded-full bg-status-warning"
                      aria-label="waiting for you"
                    />
                  ) : null}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </>
        }
      />
      {tab === 'plan' ? (
        <ResearchPageBody>
          <ResearchPlanView state={plan} />
        </ResearchPageBody>
      ) : (
        <ResearchPageBody className="space-y-3">
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          {loading && !document ? (
            <p role="status" className="text-sm text-muted-foreground">
              Loading experiments…
            </p>
          ) : null}
          {!loading && document && visibleExperiments.length === 0 ? (
            <ResearchEmptyState
              icon={FlaskConical}
              title={
                query
                  ? 'No matching experiments'
                  : project
                    ? 'No experiments yet'
                    : 'Project unavailable'
              }
            >
              {query
                ? 'Try a different name.'
                : project
                  ? 'Experiments collect runs and comparisons from your research conversations. Expand Experiments in the sidebar to create one.'
                  : 'Return to Projects and reopen a workspace.'}
            </ResearchEmptyState>
          ) : null}
          {visibleExperiments.map((experiment) => {
            const runs = document?.runs.filter((run) => run.experimentId === experiment.id) ?? []
            return (
              <article key={experiment.id} className={cn(RAISED_CARD, 'p-4')}>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-sm font-medium">{experiment.name}</h2>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {experiment.archived ? 'Archived · ' : ''}
                      {runs.length} {runs.length === 1 ? 'run' : 'runs'} ·{' '}
                      {experiment.workspacePath}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void openExperiment(experiment)}
                  >
                    Open
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    aria-label={`Delete ${experiment.name}`}
                    onClick={() => void deleteExperiment(experiment)}
                  >
                    <Trash2 aria-hidden />
                    Delete
                  </Button>
                </div>
              </article>
            )
          })}
        </ResearchPageBody>
      )}
    </section>
  )
}
