import { useState } from 'react'
import { LocateFixed } from 'lucide-react'
import type { ExperimentRecord } from '../../../../shared/research/research-records'
import EditorPanel from '@/components/editor/EditorPanel'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store'
import { ResearchWritingFileExplorer } from './ResearchWritingFileExplorer'
import { ResearchWritingFileTreeSplit } from './ResearchWritingFileTreeSplit'
import { writingFileRoot } from './research-writing-file-tree'
import {
  readWritingFilesOpen,
  saveWritingFilesOpen,
  useWritingFilesWorthShowing
} from './research-writing-files-visibility'
import type { ManuscriptFile } from './research-writing-source'

type Props = {
  experiment: ExperimentRecord
  sourceFile: ManuscriptFile
  rootFile: ManuscriptFile | null
  editorBinding: { fileId: string; tabId: string } | null
  onSelectFile: (relativePath: string) => void
  /** SyncTeX forward search from the editor's cursor line. */
  onShowInPdf?: (relativePath: string, line: number) => void
  visible: boolean
}

export function ResearchWritingSourcePane({
  experiment,
  sourceFile,
  rootFile,
  editorBinding,
  onSelectFile,
  onShowInPdf,
  visible
}: Props): React.JSX.Element {
  const mainSourcePath = rootFile?.relativePath ?? sourceFile.relativePath
  const [chosenFilesOpen, setChosenFilesOpen] = useState(() => readWritingFilesOpen(experiment.id))
  const filesWorthShowing = useWritingFilesWorthShowing(experiment, writingFileRoot(mainSourcePath))
  // Until the user picks, open the tree only when there is more than one file to choose from.
  const filesOpen = chosenFilesOpen ?? filesWorthShowing ?? false
  const editorTabId = useAppStore((state) =>
    editorBinding
      ? state.unifiedTabsByWorktree[experiment.workspaceId]?.find(
          (tab) => tab.contentType === 'editor' && tab.entityId === editorBinding.fileId
        )?.id
      : undefined
  )

  return (
    <div className="min-h-0 min-w-0 flex-col" style={{ display: visible ? 'flex' : 'none' }}>
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-1.5">
        <div className="flex min-w-0 items-baseline gap-2">
          <h2 className="shrink-0 text-xs font-semibold">TeX</h2>
          <span
            className="truncate font-mono text-2xs text-muted-foreground"
            title={sourceFile.absolutePath}
          >
            {sourceFile.relativePath}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {onShowInPdf && editorBinding ? (
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label="Show cursor line in PDF"
              title="Show cursor line in PDF"
              onClick={() =>
                onShowInPdf(
                  sourceFile.relativePath,
                  useAppStore.getState().editorCursorLine[editorBinding.fileId] ?? 1
                )
              }
            >
              <LocateFixed aria-hidden />
            </Button>
          ) : null}
          <Button
            size="xs"
            variant="ghost"
            aria-pressed={filesOpen}
            onClick={() => {
              saveWritingFilesOpen(experiment.id, !filesOpen)
              setChosenFilesOpen(!filesOpen)
            }}
          >
            Files
          </Button>
        </div>
      </div>
      <ResearchWritingFileTreeSplit
        experimentId={experiment.id}
        filesOpen={filesOpen}
        fileTree={
          <ResearchWritingFileExplorer
            experiment={experiment}
            mainSourcePath={mainSourcePath}
            activeSourcePath={sourceFile.relativePath}
            onSelectFile={onSelectFile}
          />
        }
        editor={
          editorBinding ? (
            <EditorPanel
              activeFileId={editorBinding.fileId}
              activeViewStateId={editorTabId ?? editorBinding.tabId}
              isVisible
              isCmdSaveOwner
              markdownAnnotationsEnabled={false}
            />
          ) : (
            <p role="alert" className="p-4 text-sm text-muted-foreground">
              Opening editor…
            </p>
          )
        }
      />
    </div>
  )
}
