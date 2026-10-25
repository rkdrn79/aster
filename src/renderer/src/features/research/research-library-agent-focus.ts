const FOCUS_EVENT = 'aster:research-library-agent-focus'
let pendingScopeKey: string | null = null

export function requestLibraryAgentFocus(scopeKey: string): void {
  pendingScopeKey = scopeKey
  window.dispatchEvent(new Event(FOCUS_EVENT))
}

export function consumeLibraryAgentFocus(scopeKey: string): boolean {
  if (pendingScopeKey !== scopeKey) {
    return false
  }
  pendingScopeKey = null
  return true
}

export function subscribeLibraryAgentFocus(listener: () => void): () => void {
  window.addEventListener(FOCUS_EVENT, listener)
  return () => window.removeEventListener(FOCUS_EVENT, listener)
}
