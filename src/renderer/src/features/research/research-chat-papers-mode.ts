import { useSyncExternalStore } from 'react'

// What Aster does with a paper a chat mentions that the project's Library lacks. One choice for
// every project, kept like the reading language: the Library's own settings live on this device.

export const CHAT_PAPER_MODES = [
  { id: 'ask', label: 'Ask', menuLabel: 'Ask each time' },
  { id: 'auto', label: 'Add automatically', menuLabel: 'Add automatically' },
  { id: 'off', label: 'Off', menuLabel: 'Off' }
] as const

export type ChatPaperMode = (typeof CHAT_PAPER_MODES)[number]['id']

const MODE_STORAGE_KEY = 'aster.library.chatPapers.mode'
const listeners = new Set<() => void>()
/** Set only when this device refuses to save, so the choice still holds in this window. */
let unsavedMode: ChatPaperMode | null = null

function isChatPaperMode(value: string | null): value is ChatPaperMode {
  return CHAT_PAPER_MODES.some((mode) => mode.id === value)
}

export function readChatPaperMode(): ChatPaperMode {
  if (unsavedMode) {
    return unsavedMode
  }
  try {
    const saved = window.localStorage.getItem(MODE_STORAGE_KEY)
    return isChatPaperMode(saved) ? saved : 'ask'
  } catch {
    return 'ask'
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  const onStorage = (event: StorageEvent): void => {
    if (event.key === MODE_STORAGE_KEY) {
      listener()
    }
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

export function chooseChatPaperMode(mode: ChatPaperMode): void {
  try {
    window.localStorage.setItem(MODE_STORAGE_KEY, mode)
    unsavedMode = null
  } catch {
    unsavedMode = mode
  }
  for (const listener of listeners) {
    listener()
  }
}

export function useChatPaperMode(): ChatPaperMode {
  return useSyncExternalStore(subscribe, readChatPaperMode, () => 'ask' as const)
}
