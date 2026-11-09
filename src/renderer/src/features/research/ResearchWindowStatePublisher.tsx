import { useEffect } from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { normalizeExecutionHostId } from '../../../../shared/execution-host'
import { formatAgentTypeLabel } from '../../../../shared/agent-type-label'
import type { ResearchWindowTarget } from '../../../../shared/research-page-window'
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
): Promise<void> {
  if (!target.hostId) {
    toast.error('This project has no host to start a chat on yet.')
    return
  }
  const { launchResearchChat } = await import('./ResearchAgentChatPane')
  const result = await launchResearchChat({
    hostId: target.hostId,
    workspaceId: target.workspaceId,
    agent,
    label: formatAgentTypeLabel(agent),
    activate: false
  })
  if ('error' in result) {
    toast.error(result.error)
  }
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
    const offRequest = api.onStateRequested(() => {
      windowsOpen = true
      offStore ??= useAppStore.subscribe((next, previous) => {
        if (researchWindowStateChanged(previous, next)) {
          queuePublish()
        }
      })
      publish()
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
    const offLaunch = api.onLaunchChat((target, agent) => {
      void launchChatForResearchWindow(target, agent)
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
