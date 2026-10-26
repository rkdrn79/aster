import { useEffect, useMemo, useState } from 'react'
import { FilePenLine } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import type { ExperimentRecord } from '../../../../shared/research/research-records'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store'
import { useResearchRecords } from './research-records-store'
import { researchErrorText } from './research-error-text'
import { selectResearchWorkspaceContext } from './research-workspace-context'
import { ResearchEmptyState, ResearchPageBody, ResearchPageHeader } from './ResearchPageLayout'
import {
  projectWritingRecord,
  readProjectPdfPath,
  readWritingManuscript,
  writingOwnerExperiment,
  type WritingProjectScope
} from './research-writing-project'
import { ResearchWritingWorkspace } from './ResearchWritingWorkspace'

/** The project manuscript remains the same when its first Experiment appears. */
function ResearchWritingProject({
  scope,
  owner
}: {
  scope: WritingProjectScope
  owner: ExperimentRecord | null
}): React.JSX.Element {
  const ownerSourceKey = `${owner?.manuscript?.sourcePath ?? ''}:${owner?.manuscript?.pdfPath ?? ''}`
  const [resolved, setResolved] = useState<{
    ownerSourceKey: string
    manuscript: ExperimentRecord['manuscript']
    error: string | null
  } | null>(null)
  const [readKey, setReadKey] = useState(0)
  useEffect(() => {
    let live = true
    void readWritingManuscript(scope, owner?.manuscript).then(
      (value) => live && setResolved({ ownerSourceKey, manuscript: value, error: null }),
      (cause: unknown) =>
        live &&
        setResolved({ ownerSourceKey, manuscript: undefined, error: researchErrorText(cause) })
    )
    return () => {
      live = false
    }
  }, [scope, owner?.id, owner?.manuscript, ownerSourceKey, readKey])
  const current = resolved?.ownerSourceKey === ownerSourceKey ? resolved : null
  const projectManuscript = current ? current.manuscript : owner?.manuscript
  const record = useMemo(() => {
    const manuscript = projectManuscript ?? owner?.manuscript
    const projectRecord = projectWritingRecord(scope, manuscript)
    const built = manuscript ? readProjectPdfPath(projectRecord.id, manuscript.sourcePath) : null
    const resolvedManuscript = built && manuscript ? { ...manuscript, pdfPath: built } : manuscript
    return owner
      ? { ...owner, manuscript: resolvedManuscript }
      : { ...projectRecord, manuscript: resolvedManuscript }
  }, [scope, owner, projectManuscript])
  if (current?.error || (!current && !owner?.manuscript)) {
    return (
      <section
        className="flex min-h-0 flex-1 flex-col bg-background text-foreground"
        aria-label="Research writing"
      >
        <ResearchPageHeader title="Writing" />
        <ResearchPageBody>
          {current?.error ? (
            <ResearchEmptyState
              icon={FilePenLine}
              title="Writing files unavailable"
              action={
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setReadKey((value) => value + 1)}
                >
                  Retry
                </Button>
              }
            >
              {current.error}
            </ResearchEmptyState>
          ) : (
            <p role="status" className="text-sm text-muted-foreground">
              Opening Writing…
            </p>
          )}
        </ResearchPageBody>
      </section>
    )
  }
  return (
    <ResearchWritingWorkspace
      key={`${scope.hostId}:${scope.workspaceId}:${record.manuscript?.sourcePath ?? 'none'}`}
      record={record}
      scope={scope}
      projectOnly={!owner}
      onManuscriptChanged={() => setReadKey((value) => value + 1)}
    />
  )
}

/** Writing is the project's: the manuscript and its chat never follow the selected Experiment. */
export function ResearchWritingPage(): React.JSX.Element {
  const context = useAppStore(useShallow(selectResearchWorkspaceContext))
  const owner = useResearchRecords((state) =>
    state.document
      ? writingOwnerExperiment(state.document.experiments, {
          hostId: context.hostId,
          workspaceId: context.workspaceId
        })
      : null
  )
  const { hostId, workspaceId, workspacePath, projectId } = context
  const name = context.projectName ?? context.workspaceName ?? 'Project'
  const scope = useMemo<WritingProjectScope | null>(
    () =>
      hostId && workspaceId && workspacePath
        ? { hostId, workspaceId, workspacePath, projectId, name }
        : null,
    [hostId, workspaceId, workspacePath, projectId, name]
  )
  if (!scope) {
    return (
      <section
        className="flex min-h-0 flex-1 flex-col bg-background text-foreground"
        aria-label="Research writing"
      >
        <ResearchPageHeader title="Writing" />
        <ResearchPageBody>
          <ResearchEmptyState icon={FilePenLine} title="No project open">
            Open a project to write its paper.
          </ResearchEmptyState>
        </ResearchPageBody>
      </section>
    )
  }
  const scopeKey = `${scope.hostId}:${scope.workspaceId}`
  return <ResearchWritingProject key={scopeKey} scope={scope} owner={owner} />
}
