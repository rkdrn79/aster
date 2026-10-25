import { useAppStore } from '@/store'
import type { LaunchAgentInNewTabResult } from '@/lib/launch-agent-in-new-tab'
import type { Tab } from '../../../../shared/tab-types'
import { splitAsterContext } from '../../../../shared/aster-context-block'

// Why bounded: a remote host publishes the chat's tab after it answers; a host that never does
// must not leave a store subscription behind.
const TAB_WAIT_MS = 15_000
const TITLE_LIMIT = 60

function sessionTab(workspaceId: string, sessionId: string): Tab | undefined {
  return (useAppStore.getState().unifiedTabsByWorktree[workspaceId] ?? []).find(
    (tab) => tab.entityId === sessionId
  )
}

function whenSessionTab(workspaceId: string, sessionId: string): Promise<Tab | undefined> {
  const listed = sessionTab(workspaceId, sessionId)
  if (listed) {
    return Promise.resolve(listed)
  }
  return new Promise((resolve) => {
    const finish = (tab: Tab | undefined): void => {
      clearTimeout(timer)
      unsubscribe()
      resolve(tab)
    }
    const timer = setTimeout(() => finish(undefined), TAB_WAIT_MS)
    const unsubscribe = useAppStore.subscribe(() => {
      const tab = sessionTab(workspaceId, sessionId)
      if (tab) {
        finish(tab)
      }
    })
  })
}

function nameTab(tabId: string, label: string): void {
  useAppStore.getState().setTabCustomTitle(tabId, label, { recordInteraction: false })
}

function clip(part: string): string {
  const text = part.replace(/\s+/g, ' ').trim()
  return text.length > TITLE_LIMIT ? `${text.slice(0, TITLE_LIMIT - 1)}…` : text
}

/** A chat title from its parts, e.g. "Denoiser samples · agent"; each part is clipped alone. */
export function researchChatTitle(...parts: string[]): string {
  return parts.map(clip).filter(Boolean).join(' · ')
}

/** "<prefix> · <the prompt's context label>", else the fallback. */
export function researchChatTitleFromPrompt(
  prompt: string | undefined,
  prefix: string,
  fallback: string
): string {
  const label = prompt ? splitAsterContext(prompt)?.contexts[0]?.label : undefined
  return label ? researchChatTitle(prefix, label) : fallback
}

/**
 * Names a chat Aster started, as the user's own rename would, so its title never comes from the
 * prompt Aster wrote. A chat the user already named keeps that name.
 */
export function nameResearchChat(
  workspaceId: string,
  result: NonNullable<LaunchAgentInNewTabResult>,
  label: string
): void {
  if (result.surface.kind !== 'host-published') {
    nameTab(result.surface.tabId, label)
    return
  }
  void result.structuredSettlement?.then(async (settled) => {
    if (settled.kind !== 'structured' && settled.kind !== 'visibility-unknown') {
      return
    }
    const tab = await whenSessionTab(workspaceId, settled.sessionId)
    if (tab && !tab.customLabel) {
      nameTab(tab.id, label)
    }
  })
}
