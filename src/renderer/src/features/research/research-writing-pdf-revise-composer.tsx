import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MessageSquareText, X } from 'lucide-react'
import type { PdfTextSelection } from '@/components/editor/pdf-text-selection'
import type { ExperimentRecord } from '../../../../shared/research/research-records'
import { isEditorModelDirty } from '@/components/editor/editor-save-disk-precondition'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useAppStore } from '@/store'
import { structuredAgentSessionOwnerForTab } from '@/runtime/structured-agent-session-owner'
import { selectResearchWorkspaceContext } from './research-workspace-context'
import {
  validateWritingAgentBinding,
  writingAgentBindingError
} from './research-writing-agent-binding'
import {
  formatPdfRevisionRange,
  sendWritingPdfRevision,
  type PdfRevisionSource
} from './research-writing-pdf-agent-send'
import { useWritingPdfSourceLocation } from './research-writing-pdf-source-location'
import { startProjectPdfRevision } from './research-writing-pdf-background-revision'

export function ResearchWritingPdfReviseComposer({
  experiment,
  projectOnly = false,
  source,
  selection,
  onClose,
  onSent
}: {
  experiment: ExperimentRecord
  projectOnly?: boolean
  source: PdfRevisionSource
  selection: PdfTextSelection
  onClose: () => void
  onSent?: (sessionId: string) => void
}): React.JSX.Element {
  const [instruction, setInstruction] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const sendingRef = useRef(false)
  const location = useWritingPdfSourceLocation(
    experiment.id,
    source.pdfFile.relativePath,
    selection,
    !projectOnly
  )

  async function send(): Promise<void> {
    if (sendingRef.current) {
      return
    }
    const state = useAppStore.getState()
    const workspace = selectResearchWorkspaceContext(state)
    if (
      workspace.workspaceId !== experiment.workspaceId ||
      workspace.hostId !== experiment.hostId
    ) {
      setMessage('Return to this manuscript workspace before sending the revision.')
      return
    }
    const boundSessionId = experiment.writingAgentSessionId
    const tab = projectOnly
      ? undefined
      : (state.unifiedTabsByWorktree[experiment.workspaceId] ?? []).find(
          (candidate) => candidate.entityId === boundSessionId
        )
    const check = projectOnly
      ? null
      : validateWritingAgentBinding({
          experiment,
          boundSessionId,
          currentWorkspaceId: workspace.workspaceId,
          currentHostId: workspace.hostId,
          tab,
          tabOwnerHostId: tab ? structuredAgentSessionOwnerForTab(state, tab) : null
        })
    if (check && !check.ok) {
      setMessage(writingAgentBindingError(check.reason))
      return
    }
    if (
      state.openFiles.some(
        (file) =>
          file.worktreeId === experiment.workspaceId &&
          file.relativePath.toLowerCase().endsWith('.tex') &&
          (isEditorModelDirty(state, file) || Boolean(file.externalMutation))
      )
    ) {
      setMessage(
        'Save or resolve open TeX edits before sending; the PDF does not identify its source file.'
      )
      return
    }
    sendingRef.current = true
    setSending(true)
    setMessage(null)
    try {
      if (projectOnly) {
        const failure = await startProjectPdfRevision({
          project: experiment,
          source,
          selection,
          instruction
        })
        if (failure) {
          setMessage(failure)
        } else {
          onClose()
        }
        return
      }
      if (!check?.ok) {
        return
      }
      const result = await sendWritingPdfRevision({
        source,
        selection,
        instruction,
        binding: check.binding,
        location: location === 'finding' ? null : location
      })
      if (result.status === 'sent') {
        onSent?.(check.binding.sessionId)
        onClose()
      } else if (result.status === 'invalid') {
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
    } catch (cause) {
      setMessage(
        projectOnly
          ? `Could not start the revision on the project host. ${String(cause)}`
          : 'Could not confirm delivery. Check the Writing chat before sending again.'
      )
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }

  const left = Math.max(12, Math.min(selection.anchor.x, window.innerWidth - 460))
  const top = Math.max(12, Math.min(selection.anchor.y, window.innerHeight - 410))

  return createPortal(
    <div
      role="dialog"
      aria-label="Revise selected PDF text"
      className="fixed z-[100] flex max-h-[min(75vh,440px)] w-[min(28rem,calc(100vw-24px))] flex-col overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-xl"
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
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">Revise PDF text</h2>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          aria-label="Close PDF revision"
          onClick={onClose}
        >
          <X aria-hidden />
        </Button>
      </div>
      <div className="scrollbar-sleek min-h-0 space-y-3 overflow-y-auto p-3">
        <p className="text-xs text-muted-foreground">Page {selection.pageNumber}</p>
        <blockquote className="scrollbar-sleek max-h-28 overflow-auto whitespace-pre-wrap break-words rounded-md border-l-2 border-primary/50 bg-muted/40 p-2.5 text-xs">
          {selection.text}
        </blockquote>
        <label className="block space-y-1 text-xs font-medium">
          Instruction
          <Textarea
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            rows={3}
            autoFocus
            placeholder="What should change in this passage?"
            disabled={sending}
          />
        </label>
        {location && location !== 'finding' ? (
          <p className="text-xs text-muted-foreground">
            Source:{' '}
            <span className="font-mono text-foreground">
              {location.ranges.map(formatPdfRevisionRange).join(', ')}
            </span>
            {location.stale ? ' (edited since the last build)' : ''}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            {location === 'finding'
              ? 'Finding the TeX source…'
              : 'Source line unknown; the agent will search for this passage.'}
          </p>
        )}
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
          disabled={sending || location === 'finding' || !instruction.trim()}
          onClick={() => void send()}
        >
          {sending
            ? 'Sending…'
            : projectOnly
              ? 'Start background revision'
              : 'Send to Writing agent'}
        </Button>
      </div>
    </div>,
    document.body
  )
}
