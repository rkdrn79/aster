const FOCUS_EVENT = 'aster:research-writing-agent-focus'
let pendingExperimentId: string | null = null

export function requestWritingAgentFocus(experimentId: string): void {
  pendingExperimentId = experimentId
  window.dispatchEvent(new Event(FOCUS_EVENT))
}

/** Writing is project-wide, so a request from any of the project's Experiments is accepted. */
export function consumeWritingAgentFocus(accepts: (experimentId: string) => boolean): boolean {
  if (pendingExperimentId === null || !accepts(pendingExperimentId)) {
    return false
  }
  pendingExperimentId = null
  return true
}

export function subscribeWritingAgentFocus(listener: () => void): () => void {
  window.addEventListener(FOCUS_EVENT, listener)
  return () => window.removeEventListener(FOCUS_EVENT, listener)
}
