import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'
import { useLiveDashboardSnapshot } from '@/components/dashboard/useLiveDashboardSnapshot'
import { orchestrationWorkersOf } from '@/components/native-chat/native-chat-orchestration-workers'
import { buildPhoneSessions, type PhoneSession } from './phone-sessions'
import { nestPhoneSessions, type PhoneSessionFamily } from './phone-session-families'
import { usePhoneTerminalPreviews } from './phone-terminal-previews'

/** Every session across workspaces, most urgent first. */
export function usePhoneSessions(): PhoneSession[] {
  const tabsByWorktree = useAppStore((state) => state.unifiedTabsByWorktree)
  const terminalTabsByWorktree = useAppStore((state) => state.tabsByWorktree)
  const generatedTitlesEnabled = useAppStore(
    (state) => state.settings?.tabAutoGenerateTitle === true
  )
  const snapshot = useLiveDashboardSnapshot()
  const previews = usePhoneTerminalPreviews((state) => state.byTabId)
  const previewsLoaded = usePhoneTerminalPreviews((state) => state.loaded)
  return useMemo(
    () =>
      buildPhoneSessions({
        tabsByWorktree,
        cards: snapshot.cards,
        previews,
        previewsLoaded,
        terminalTabsByWorktree,
        generatedTitlesEnabled
      }),
    [
      tabsByWorktree,
      terminalTabsByWorktree,
      snapshot.cards,
      previews,
      previewsLoaded,
      generatedTitlesEnabled
    ]
  )
}

/** `sessions` with each orchestration worker nested under the session that launched it. */
export function usePhoneSessionFamilies(sessions: readonly PhoneSession[]): PhoneSessionFamily[] {
  const sources = useAppStore(
    useShallow((state) => ({
      runtimeAgentOrchestrationByPaneKey: state.runtimeAgentOrchestrationByPaneKey,
      agentStatusByPaneKey: state.agentStatusByPaneKey,
      retainedAgentsByPaneKey: state.retainedAgentsByPaneKey,
      unifiedTabsByWorktree: state.unifiedTabsByWorktree
    }))
  )
  return useMemo(
    () =>
      nestPhoneSessions(
        sessions,
        orchestrationWorkersOf(sources, () => true)
      ),
    [sessions, sources]
  )
}
