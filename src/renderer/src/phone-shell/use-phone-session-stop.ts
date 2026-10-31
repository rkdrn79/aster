import { useCallback } from 'react'
import { useConfirmationDialog } from '@/components/confirmation-dialog-context'
import { createWorkspaceTabCloseCommands } from '@/components/tab-group/workspace-tab-close-commands'
import { useAppStore } from '@/store'
import type { PhoneSession } from './phone-sessions'
import { usePhoneNavigation } from './phone-navigation-store'

/**
 * Closes a session the way the desktop's tab close button does: a chat through the host's
 * session close, a terminal through the terminal close path that ends its process.
 */
function closePhoneSession(session: Pick<PhoneSession, 'worktreeId' | 'tabId'>): void {
  const groupTabs = useAppStore.getState().unifiedTabsByWorktree[session.worktreeId] ?? []
  createWorkspaceTabCloseCommands({ worktreeId: session.worktreeId, groupTabs }).closeItem(
    session.tabId,
    // Why: the phone already asked; the desktop's running-process prompt would ask twice.
    { skipRunningProcessConfirm: true }
  )
}

/** "Stop agent" for an agent, "Close terminal" for a shell, each behind one confirmation. */
export function usePhoneSessionStop(session: PhoneSession | undefined): {
  label: string
  run: () => void
} | null {
  const confirm = useConfirmationDialog()
  const isAgent = Boolean(session?.agentType)
  const run = useCallback(() => {
    if (!session) {
      return
    }
    void confirm({
      title: isAgent ? `Stop ${session.title}?` : `Close ${session.title}?`,
      description: isAgent
        ? 'This ends the agent on the host and closes its session. Work it has not saved is lost.'
        : 'This ends the shell on the host and anything still running in it.',
      confirmLabel: isAgent ? 'Stop agent' : 'Close terminal',
      confirmVariant: 'destructive',
      compact: true
    }).then((confirmed) => {
      if (!confirmed) {
        return
      }
      closePhoneSession(session)
      usePhoneNavigation.getState().pop()
    })
  }, [confirm, isAgent, session])
  return session ? { label: isAgent ? 'Stop agent' : 'Close terminal', run } : null
}
