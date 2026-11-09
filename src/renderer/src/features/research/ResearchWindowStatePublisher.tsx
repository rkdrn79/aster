import { useEffect } from 'react'
import { useAppStore } from '@/store'
import { normalizeExecutionHostId } from '../../../../shared/execution-host'
import { formatAgentTypeLabel } from '../../../../shared/agent-type-label'
import type {
  ResearchWindowLaunchResult,
  ResearchWindowTarget
} from '../../../../shared/research-page-window'
import type { TuiAgent } from '../../../../shared/tui-agent'
import { enterResearchWorkspace, openResearchView } from './research-navigation'
import { pickResearchWindowState, researchWindowStateChanged } from './research-window-state'

/** Shows a research window's page in this window, for what only the main window can do. */
export function revealResearchPageInMain(target: ResearchWindowTarget): void {
  const executionHostId = normalizeExecutionHostId(target.hostId) ?? undefined
  enterResearchWorkspace({ id: target.workspaceId, executionHostId })
  // A project window's Chats are this window's Workbench.
  openResearchView(target.page === 'research-chats' ? 'terminal' : target.page)
}

/** Starts a chat in a research window's project; this window stays on the project it shows. */
async function launchChatForResearchWindow(
  target: ResearchWindowTarget,
  agent: TuiAgent
): Promise<ResearchWindowLaunchResult> {
  if (!target.hostId) {
    return { error: 'This project has no host to start a chat on yet.' }
  }
  const { launchResearchChat } = await import('./ResearchAgentChatPane')
  return launchResearchChat({
    hostId: target.hostId,
    workspaceId: target.workspaceId,
    agent,
    label: formatAgentTypeLabel(agent),
    activate: false
  }).catch((cause: unknown) => ({ error: `The chat could not start. ${String(cause)}` }))
}

/** Calls `onChange` whenever a slice the research windows read changes. */
function followResearchWindowState(onChange: () => void): () => void {
  return useAppStore.subscribe((next, previous) => {
    if (researchWindowStateChanged(previous, next)) {
      onChange()
    }
  })
}

/** Main window: keeps open research windows supplied with the projects and workspaces they read. */
export function ResearchWindowStatePublisher(): null {
  useEffect(() => {
    const api = window.api.researchWindow
    if (!api) {
      return
    }
    let windowsOpen = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let offStore: (() => void) | null = null
    const publish = (): void => {
      timer = null
      if (windowsOpen) {
        void api.publishState(pickResearchWindowState(useAppStore.getState()))
      }
    }
    const queuePublish = (): void => {
      if (windowsOpen && timer === null) {
        timer = setTimeout(publish, 100)
      }
    }
    const startPublishing = (): void => {
      windowsOpen = true
      offStore ??= followResearchWindowState(queuePublish)
      publish()
    }
    const offRequest = api.onStateRequested(startPublishing)
    // Why: this window can reload while research windows stay open; they would go stale otherwise.
    void api.hasOpenWindows?.().then((open) => {
      if (open) {
        startPublishing()
      }
    })
    const offClosed = api.onAllClosed(() => {
      windowsOpen = false
      offStore?.()
      offStore = null
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
    })
    const offReveal = api.onRevealInMain(revealResearchPageInMain)
    const offLaunch = api.onLaunchChat((target, agent, requestId) => {
      void launchChatForResearchWindow(target, agent).then((result) =>
        api.reportLaunchChatResult(requestId, result)
      )
    })
    return () => {
      if (timer !== null) {
        clearTimeout(timer)
      }
      offStore?.()
      offRequest()
      offClosed()
      offReveal()
      offLaunch()
    }
  }, [])
  return null
}
