import { useState } from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { activateStructuredAgentSessionTab } from '@/lib/structured-agent-session-tab-activation'
import {
  appendManuscriptRevisionToAgentDraft,
  MAX_MANUSCRIPT_SELECTION_LENGTH,
  type ManuscriptSelection
} from './manuscript-selection-revision'

export function ManuscriptRevisionDialog({
  selection,
  worktreeId,
  onClose
}: {
  selection: ManuscriptSelection | null
  worktreeId: string
  onClose: () => void
}): React.JSX.Element | null {
  if (!selection) {
    return null
  }
  return (
    <ManuscriptRevisionDialogContent
      selection={selection}
      worktreeId={worktreeId}
      onClose={onClose}
    />
  )
}

function ManuscriptRevisionDialogContent({
  selection,
  worktreeId,
  onClose
}: {
  selection: ManuscriptSelection
  worktreeId: string
  onClose: () => void
}): React.JSX.Element {
  const workspaceTabs = useAppStore((state) => state.unifiedTabsByWorktree[worktreeId])
  const sessions = (workspaceTabs ?? []).filter((tab) => tab.contentType === 'agent-session')
  const [instruction, setInstruction] = useState('Improve clarity and precision.')
  const [targetTabId, setTargetTabId] = useState('')
  const selectedTab = sessions.find((tab) => tab.id === targetTabId)
  const selectionValid =
    selection.selectedText.trim().length > 0 &&
    selection.selectedText.length <= MAX_MANUSCRIPT_SELECTION_LENGTH

  const addToDraft = (): void => {
    if (!selectedTab || !instruction.trim() || !selectionValid) {
      return
    }
    const currentTab = (useAppStore.getState().unifiedTabsByWorktree[worktreeId] ?? []).find(
      (tab) => tab.id === selectedTab.id && tab.contentType === 'agent-session'
    )
    if (!currentTab) {
      toast.error('This agent chat is no longer open.')
      return
    }
    const state = useAppStore.getState()
    if (
      state.activeWorktreeId !== worktreeId &&
      !state.setActiveWorktree(worktreeId, currentTab.executionHostId)
    ) {
      toast.error('Could not open the workspace for this agent chat.')
      return
    }
    if (!activateStructuredAgentSessionTab({ worktreeId, tabId: currentTab.id })) {
      toast.error('Could not open this agent chat.')
      return
    }
    let saved = false
    try {
      saved = appendManuscriptRevisionToAgentDraft({
        selection,
        instruction,
        sessionId: currentTab.entityId
      })
    } catch {
      saved = false
    }
    if (!saved) {
      toast.error('The agent draft could not be saved. Keep this dialog open and try again.')
      return
    }
    useAppStore.getState().setActiveView('terminal')
    onClose()
    toast.success('Revision request added to the agent draft. Review it before sending.')
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[85vh] max-w-xl flex-col overflow-hidden sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Ask agent to revise selection</DialogTitle>
          <DialogDescription>
            Add a proposal request to an existing agent chat draft. Review it before sending; the
            agent is asked not to edit files.
          </DialogDescription>
        </DialogHeader>
        <div className="scrollbar-sleek flex min-h-0 flex-col gap-4 overflow-y-auto">
          <div className="space-y-1">
            <p className="text-xs font-medium text-foreground">Selected source</p>
            <p
              className="truncate font-mono text-xs text-muted-foreground"
              title={selection.filePath}
            >
              {selection.relativePath} · {selection.startLine}:{selection.startColumn}–
              {selection.endLine}:{selection.endColumn}
            </p>
            <pre className="scrollbar-sleek max-h-36 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/40 p-3 font-mono text-xs text-foreground">
              {selection.selectedText}
            </pre>
            {!selectionValid ? (
              <p className="text-xs text-destructive">
                Select up to {MAX_MANUSCRIPT_SELECTION_LENGTH.toLocaleString()} characters of
                manuscript source.
              </p>
            ) : null}
          </div>
          <label className="space-y-1 text-xs font-medium text-foreground">
            Revision instruction
            <Textarea
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              rows={3}
              placeholder="What should change in this passage?"
              className="mt-1 resize-y"
              autoFocus
            />
          </label>
          <div className="space-y-2">
            <p className="text-xs font-medium text-foreground">Agent chat</p>
            {sessions.length === 0 ? (
              <p className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                Open an agent chat in this workspace, then select the passage again.
              </p>
            ) : (
              <div
                className="scrollbar-sleek max-h-32 space-y-1 overflow-y-auto"
                role="group"
                aria-label="Agent chat"
              >
                {sessions.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    aria-pressed={tab.id === targetTabId}
                    onClick={() => setTargetTabId(tab.id)}
                    className={`w-full rounded-md border px-3 py-2 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      tab.id === targetTabId
                        ? 'border-ring bg-accent text-foreground'
                        : 'border-border bg-background text-muted-foreground hover:bg-accent'
                    }`}
                  >
                    {tab.customLabel || tab.label || 'Agent chat'}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!selectedTab || !instruction.trim() || !selectionValid}
            onClick={addToDraft}
          >
            Add to agent draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
