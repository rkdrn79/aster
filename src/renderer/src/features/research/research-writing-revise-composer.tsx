import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MessageSquareText, X } from 'lucide-react'
import type { ExperimentRecord } from '../../../../shared/research/research-records'
import type { ManuscriptSelection } from '@/components/editor/manuscript-selection-revision'
import { useAppStore } from '@/store'
import { selectResearchWorkspaceContext } from './research-workspace-context'
import { structuredAgentSessionOwnerForTab } from '@/runtime/structured-agent-session-owner'
import { isEditorModelDirty } from '@/components/editor/editor-save-disk-precondition'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  validateWritingAgentBinding,
  writingAgentBindingError
} from './research-writing-agent-binding'
import { sendWritingAgentRevision } from './research-writing-agent-send'
import { writingAgentEditBlocker } from './research-writing-agent-edit-guard'

export type ResearchWritingReviseComposerProps = {
  selection: ManuscriptSelection | null
  experiment: ExperimentRecord
  /** An explicitly chosen structured chat. Usually experiment.writingAgentSessionId. */
  boundSessionId: string | null
  /** Viewport coordinates of the Revise context-menu action. */
  anchor: { x: number; y: number } | null
  onClose: () => void
  onSent?: (sessionId: string) => void
}

/** Floating request composer; only its Send button dispatches to the selected Writing chat. */
export function ResearchWritingReviseComposer({
  selection,
  experiment,
  boundSessionId,
  anchor,
  onClose,
  onSent
}: ResearchWritingReviseComposerProps): React.JSX.Element | null {
  if (!selection || !anchor) {
    return null
  }
  return (
    <ResearchWritingReviseComposerContent
      selection={selection}
      experiment={experiment}
      boundSessionId={boundSessionId}
      anchor={anchor}
      onClose={onClose}
      onSent={onSent}
    />
  )
}

function ResearchWritingReviseComposerContent({
  selection,
  experiment,
  boundSessionId,
  anchor,
  onClose,
  onSent
}: Omit<ResearchWritingReviseComposerProps, 'selection' | 'anchor'> & {
  selection: ManuscriptSelection
  anchor: { x: number; y: number }
}): React.JSX.Element {
  const [instruction, setInstruction] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const sendingRef = useRef(false)

  async function send(): Promise<void> {
    if (sendingRef.current) {
      return
    }
    const state = useAppStore.getState()
    const currentWorkspace = selectResearchWorkspaceContext(state)
    const tab = (state.unifiedTabsByWorktree[experiment.workspaceId] ?? []).find(
      (candidate) =>
        candidate.entityId === boundSessionId &&
        structuredAgentSessionOwnerForTab(state, candidate) === experiment.hostId
    )
    const check = validateWritingAgentBinding({
      experiment,
      boundSessionId,
      currentWorkspaceId: currentWorkspace.workspaceId,
      currentHostId: currentWorkspace.hostId,
      tab,
      tabOwnerHostId: tab ? structuredAgentSessionOwnerForTab(state, tab) : null
    })
    if (!check.ok) {
      setMessage(writingAgentBindingError(check.reason))
      return
    }
    const editBlocker = writingAgentEditBlocker({
      experiment,
      selection,
      editorViews: state.openFiles
        .filter(
          (file) =>
            file.worktreeId === experiment.workspaceId && file.filePath === selection.filePath
        )
        .map((file) => ({
          worktreeId: file.worktreeId,
          filePath: file.filePath,
          modelDirty: isEditorModelDirty(state, file),
          externalMutation: file.externalMutation,
          pendingOwnerMigration: file.pendingOwnerMigration
        }))
    })
    if (editBlocker) {
      setMessage(editBlocker)
      return
    }
    sendingRef.current = true
    setSending(true)
    setMessage(null)
    try {
      const result = await sendWritingAgentRevision({
        worktreeId: experiment.workspaceId,
        binding: check.binding,
        selection,
        instruction
      })
      if (result.status === 'sent') {
        onSent?.(check.binding.sessionId)
        onClose()
        return
      }
      if (result.status === 'invalid') {
        setMessage(result.reason)
      } else if (result.status === 'unconfirmed') {
        setMessage('Delivery could not be confirmed. Check the Writing chat before sending again.')
      } else if (result.status === 'not-ready') {
        setMessage('The Writing chat is not ready yet. Try again shortly.')
      } else if (result.status === 'not-writable') {
        setMessage('The Writing chat did not accept the request. Your instruction is still here.')
      } else {
        setMessage('The Writing chat did not confirm this request. Check the chat before retrying.')
      }
    } catch {
      setMessage('Could not confirm delivery. Check the Writing chat before sending again.')
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }

  const left = Math.max(12, Math.min(anchor.x, window.innerWidth - 460))
  const top = Math.max(12, Math.min(anchor.y, window.innerHeight - 390))

  return createPortal(
    <div
      role="dialog"
      aria-label="Revise selected manuscript passage"
      className="fixed z-[100] flex max-h-[min(70vh,420px)] w-[min(28rem,calc(100vw-24px))] flex-col overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-xl"
      style={{ left, top }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !sending) {
          event.stopPropagation()
          onClose()
        }
      }}
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <MessageSquareText className="size-4 text-muted-foreground" aria-hidden />
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">Revise with Writing agent</h2>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          aria-label="Close revision request"
          onClick={onClose}
        >
          <X aria-hidden />
        </Button>
      </div>
      <div className="scrollbar-sleek min-h-0 space-y-3 overflow-y-auto p-3">
        <div className="space-y-1">
          <p
            className="truncate font-mono text-xs text-muted-foreground"
            title={selection.filePath}
          >
            {selection.relativePath}:{selection.startLine}
            {selection.endLine !== selection.startLine ? `–${selection.endLine}` : ''}
          </p>
          <blockquote className="scrollbar-sleek max-h-28 overflow-auto whitespace-pre-wrap break-words rounded-md border-l-2 border-primary/50 bg-muted/40 p-2.5 font-mono text-xs">
            {selection.selectedText}
          </blockquote>
        </div>
        <label className="block space-y-1 text-xs font-medium">
          Instruction
          <Textarea
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            rows={3}
            autoFocus
            placeholder="What should change in this passage?"
            className="resize-y"
            disabled={sending}
          />
        </label>
        {message ? (
          <p role="alert" className="text-xs text-destructive">
            {message}
          </p>
        ) : null}
      </div>
      <div className="flex justify-end gap-2 border-t border-border px-3 py-2.5">
        <Button type="button" size="sm" variant="outline" onClick={onClose} disabled={sending}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={sending || !instruction.trim()}
          onClick={() => void send()}
        >
          {sending ? 'Sending…' : 'Send to Writing agent'}
        </Button>
      </div>
    </div>,
    document.body
  )
}
