import { useEffect, useMemo, useState } from 'react'
import { FlaskConical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAppStore } from '@/store'
import { parseExecutionHostId } from '../../../../shared/execution-host'
import type { ExperimentRecord } from '../../../../shared/research/research-records'
import { selectResearchExperiment } from '../../../../shared/research/research-selection'
import { ResearchEmptyState, ResearchPageBody, ResearchPageHeader } from './ResearchPageLayout'
import { useResearchActiveProject } from './research-home-projects'
import { openResearchExperimentPage } from './research-experiment-page'
import { useResearchRecords } from './research-records-store'

export function ResearchExperimentsPage(): React.JSX.Element {
  const { project } = useResearchActiveProject()
  const document = useResearchRecords((state) => state.document)
  const loading = useResearchRecords((state) => state.loading)
  const error = useResearchRecords((state) => state.error)
  const [query, setQuery] = useState('')

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
          experiments.length > 5 || query ? (
            <Input
              density="compact"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find experiments"
              aria-label="Find experiments"
            />
          ) : undefined
        }
      />
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
            <article key={experiment.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-sm font-semibold">{experiment.name}</h2>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {experiment.archived ? 'Archived · ' : ''}
                    {runs.length} {runs.length === 1 ? 'run' : 'runs'} · {experiment.workspacePath}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => void openExperiment(experiment)}>
                  Open
                </Button>
              </div>
            </article>
          )
        })}
      </ResearchPageBody>
    </section>
  )
}
