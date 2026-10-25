import { useCallback, useEffect, useState } from 'react'
import type { editor } from 'monaco-editor'
import { toast } from 'sonner'
import { ManuscriptRevisionDialog } from './ManuscriptRevisionDialog'
import { useAppStore } from '@/store'
import { useResearchRecords } from '@/features/research/research-records-store'
import { ResearchWritingReviseComposer } from '@/features/research/research-writing-revise-composer'
import { isWritingTeXFile } from '@/features/research/research-writing-source'
import { selectWritingOwner } from '@/features/research/research-writing-project'
import {
  captureMonacoManuscriptSelection,
  MAX_MANUSCRIPT_SELECTION_LENGTH,
  type ManuscriptSelection
} from './manuscript-selection-revision'

export function ManuscriptSelectionAction({
  editorInstance,
  enabled,
  filePath,
  relativePath,
  worktreeId
}: {
  editorInstance: editor.IStandaloneCodeEditor | null
  enabled: boolean
  filePath: string
  relativePath: string
  worktreeId?: string
}): React.JSX.Element {
  const [selection, setSelection] = useState<ManuscriptSelection | null>(null)
  const [affordance, setAffordance] = useState<{ left: number; top: number } | null>(null)
  const [revisionAnchor, setRevisionAnchor] = useState<{ x: number; y: number } | null>(null)
  const activeView = useAppStore((state) => state.activeView)
  const writingExperiment = useResearchRecords((state) =>
    selectWritingOwner(state.document, { workspaceId: worktreeId })
  )
  const isWritingManuscript =
    activeView === 'research-writing' &&
    writingExperiment !== null &&
    isWritingTeXFile(writingExperiment, worktreeId, filePath, relativePath)

  const openRevision = useCallback((): void => {
    if (!editorInstance) {
      return
    }
    const captured = captureMonacoManuscriptSelection(editorInstance, filePath, relativePath)
    if (!captured) {
      toast.message(
        `Select manuscript text (up to ${MAX_MANUSCRIPT_SELECTION_LENGTH.toLocaleString()} characters).`
      )
      return
    }
    setSelection(captured)
    if (isWritingManuscript) {
      const node = editorInstance.getDomNode()
      const rect = node?.getBoundingClientRect()
      const selected = editorInstance.getSelection()
      const visible = selected
        ? editorInstance.getScrolledVisiblePosition(selected.getEndPosition())
        : null
      setRevisionAnchor({
        x: Math.max(12, (rect?.left ?? 0) + (visible?.left ?? 16)),
        y: Math.max(12, (rect?.top ?? 0) + (visible?.top ?? 16) + (visible?.height ?? 16))
      })
    }
  }, [editorInstance, filePath, relativePath, isWritingManuscript])

  useEffect(() => {
    if (!editorInstance || !enabled || !worktreeId) {
      return
    }
    const updateAffordance = (): void => {
      const model = editorInstance.getModel()
      const selected = editorInstance.getSelection()
      if (
        !model ||
        !selected ||
        selected.isEmpty() ||
        model.getValueLengthInRange(selected) > MAX_MANUSCRIPT_SELECTION_LENGTH
      ) {
        setAffordance(null)
        return
      }
      const visible = editorInstance.getScrolledVisiblePosition(selected.getEndPosition())
      const layout = editorInstance.getLayoutInfo()
      if (!visible || visible.top < 0 || visible.top > layout.height - 12) {
        setAffordance(null)
        return
      }
      const top =
        visible.top + visible.height + 6 > layout.height - 30
          ? Math.max(4, visible.top - 28)
          : visible.top + visible.height + 6
      setAffordance({ left: Math.max(8, Math.min(visible.left + 12, layout.width - 112)), top })
    }
    const action = editorInstance.addAction({
      id: 'aster.reviseManuscriptSelection',
      label: isWritingManuscript ? 'Revise' : 'Ask agent to revise selection',
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 1.5,
      run: openRevision
    })
    const selectionListener = editorInstance.onDidChangeCursorSelection(updateAffordance)
    const scrollListener = editorInstance.onDidScrollChange(updateAffordance)
    updateAffordance()
    return () => {
      action.dispose()
      selectionListener.dispose()
      scrollListener.dispose()
    }
  }, [editorInstance, enabled, worktreeId, isWritingManuscript, openRevision])

  return (
    <>
      {affordance && enabled && worktreeId ? (
        <button
          type="button"
          className="absolute z-10 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium text-foreground shadow-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={affordance}
          onMouseDown={(event) => event.preventDefault()}
          onClick={openRevision}
        >
          {isWritingManuscript ? 'Revise' : 'Ask agent'}
        </button>
      ) : null}
      {isWritingManuscript && writingExperiment ? (
        <ResearchWritingReviseComposer
          selection={selection}
          experiment={writingExperiment}
          boundSessionId={writingExperiment.writingAgentSessionId ?? null}
          anchor={revisionAnchor}
          onClose={() => {
            setSelection(null)
            setRevisionAnchor(null)
          }}
        />
      ) : worktreeId ? (
        <ManuscriptRevisionDialog
          selection={selection}
          worktreeId={worktreeId}
          onClose={() => setSelection(null)}
        />
      ) : null}
    </>
  )
}
