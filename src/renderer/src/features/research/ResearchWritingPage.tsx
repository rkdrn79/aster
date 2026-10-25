import { useEffect, useMemo, useState } from 'react'
import { FilePenLine } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import type { ExperimentRecord } from '../../../../shared/research/research-records'
import { useAppStore } from '@/store'
import { useResearchRecords } from './research-records-store'
import { selectResearchWorkspaceContext } from './research-workspace-context'
import { ResearchEmptyState, ResearchPageBody, ResearchPageHeader } from './ResearchPageLayout'
import {
  projectWritingRecord,
  readCatalogManuscript,
  readProjectPdfPath,
  writingOwnerExperiment,
  type WritingProjectScope
} from './research-writing-project'
import { ResearchWritingWorkspace } from './ResearchWritingWorkspace'

/** A project with no Experiment yet: its manuscript is whatever the project catalog names. */
function ResearchWritingProjectOnly({ scope }: { scope: WritingProjectScope }): React.JSX.Element {
  const [manuscript, setManuscript] = useState<ExperimentRecord['manuscript'] | null>(null)
  const [readKey, setReadKey] = useState(0)
  useEffect(() => {
    let live = true
    if (scope.hostId !== 'local') {
      setManuscript(undefined)
      return
    }
    void readCatalogManuscript(scope).then((value) => live && setManuscript(value))
    return () => {
      live = false
    }
  }, [scope, readKey])
  const record = useMemo(() => {
    if (manuscript === null) {
      return null
    }
    const stand = projectWritingRecord(scope, manuscript)
    const built = manuscript ? readProjectPdfPath(stand.id, manuscript.sourcePath) : null
    return built && manuscript ? { ...stand, manuscript: { ...manuscript, pdfPath: built } } : stand
  }, [scope, manuscript])
  if (!record) {
    return <section className="flex-1 bg-background" aria-label="Research writing" />
  }
  return (
    <ResearchWritingWorkspace
      key={record.manuscript?.sourcePath ?? 'none'}
      record={record}
      scope={scope}
      projectOnly
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
  return owner ? (
    <ResearchWritingWorkspace
      key={`${scopeKey}:${owner.id}`}
      record={owner}
      scope={scope}
      projectOnly={false}
    />
  ) : (
    <ResearchWritingProjectOnly key={scopeKey} scope={scope} />
  )
}
