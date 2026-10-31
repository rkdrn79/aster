import { useEffect, useRef } from 'react'
import { useAppStore } from '@/store'
import { revealTerminalPane } from '@/lib/reveal-terminal-pane'
import { activateAndRevealWorkspace } from '@/lib/worktree-activation'
import { activateStructuredAgentSessionTab } from '@/lib/structured-agent-session-tab-activation'
import type { PhoneSession } from './phone-sessions'
import { usePhoneNavigation, type PhoneWorkbenchTarget } from './phone-navigation-store'

/** Points the shared workbench at a target with the desktop's own activation paths. */
function revealPhoneWorkbenchTarget(target: PhoneWorkbenchTarget): void {
  if (target.kind === 'session') {
    const tab = useAppStore
      .getState()
      .unifiedTabsByWorktree[target.worktreeId]?.find((candidate) => candidate.id === target.tabId)
    if (tab?.contentType === 'agent-session') {
      activateAndRevealWorkspace(
        target.worktreeId,
        target.executionHostId ? { executionHostId: target.executionHostId } : undefined
      )
      activateStructuredAgentSessionTab({ worktreeId: target.worktreeId, tabId: target.tabId })
      return
    }
    revealTerminalPane({
      worktreeId: target.worktreeId,
      tabId: tab?.entityId ?? target.tabId,
      leafId: target.leafId,
      executionHostId: target.executionHostId ?? null
    })
    return
  }
  const state = useAppStore.getState()
  if (state.activeWorktreeId !== target.worktreeId) {
    activateAndRevealWorkspace(target.worktreeId)
  }
  // Why: Back from a later file returns here, so bring this screen's file to the front again.
  if (target.kind === 'file' && target.fileId && state.activeFileId !== target.fileId) {
    state.setActiveFile(target.fileId, target.worktreeId)
  }
}

/**
 * Re-reveals the open workbench screen's target, also after Back returns to it, and once more when
 * a session that was not mirrored yet arrives; until then the workbench keeps the workspace's
 * previous tab on screen.
 */
export function usePhoneWorkbenchReveal(target: PhoneWorkbenchTarget | null): void {
  const mirrored = useAppStore((state) =>
    target?.kind === 'session'
      ? (state.unifiedTabsByWorktree[target.worktreeId]?.some((tab) => tab.id === target.tabId) ??
        false)
      : true
  )
  const revealed = useRef<PhoneWorkbenchTarget | null>(null)
  useEffect(() => {
    // Why: a session that left the host is not revealed again; it would seed an empty workspace.
    if (!target || (!mirrored && revealed.current === target)) {
      return
    }
    revealed.current = target
    revealPhoneWorkbenchTarget(target)
  }, [target, mirrored])
}

export function openPhoneSession(session: PhoneSession, subtitle: string): void {
  usePhoneNavigation.getState().push({
    kind: 'workbench',
    target: {
      kind: 'session',
      worktreeId: session.worktreeId,
      executionHostId: session.executionHostId,
      tabId: session.tabId,
      leafId: session.leafId
    },
    title: session.title,
    subtitle
  })
}
