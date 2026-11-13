import { useAppStore } from '@/store'
import type { TuiAgent } from '../../../../shared/tui-agent'
import type {
  ResearchWindowLaunchResult,
  ResearchWindowTarget
} from '../../../../shared/research-page-window'

// How long a started chat's tab may take to reach this window's copy of the main window's state.
const TAB_ARRIVAL_TIMEOUT_MS = 10_000

function hasChatTab(workspaceId: string, sessionId: string): boolean {
  const tabs = useAppStore.getState().unifiedTabsByWorktree[workspaceId] ?? []
  return tabs.some((tab) => tab.entityId === sessionId)
}

/** Resolves once the chat's tab is in this window's state, or after the timeout. */
export function waitForChatTab(
  workspaceId: string,
  sessionId: string,
  timeoutMs: number
): Promise<void> {
  if (hasChatTab(workspaceId, sessionId)) {
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    const finish = (): void => {
      clearTimeout(timer)
      unsubscribe()
      resolve()
    }
    const timer = setTimeout(finish, timeoutMs)
    const unsubscribe = useAppStore.subscribe(() => {
      if (hasChatTab(workspaceId, sessionId)) {
        finish()
      }
    })
  })
}

/**
 * A research window's chat start: the main window owns the tabs, so it starts the chat without
 * leaving the page it shows, and this window answers once the new tab has reached it, so a page
 * can link or show the chat straight away.
 */
export async function launchResearchChatThroughMainWindow(
  windowTarget: ResearchWindowTarget,
  input: {
    hostId: string
    workspaceId: string
    agent: TuiAgent
    prompt?: string
    label: string
    resumeFrom?: { providerSessionId: string }
  },
  timeoutMs = TAB_ARRIVAL_TIMEOUT_MS
): Promise<ResearchWindowLaunchResult> {
  const result = await window.api.researchWindow.launchChat(
    { ...windowTarget, workspaceId: input.workspaceId, hostId: input.hostId },
    input.agent,
    {
      ...(input.prompt ? { prompt: input.prompt } : {}),
      label: input.label,
      ...(input.resumeFrom
        ? { resumeFrom: { providerSessionId: input.resumeFrom.providerSessionId } }
        : {})
    }
  )
  if ('sessionId' in result) {
    await waitForChatTab(input.workspaceId, result.sessionId, timeoutMs)
  }
  return result
}
