import { ipcRenderer } from 'electron'
import type {
  ResearchWindowLaunchResult,
  ResearchWindowTarget
} from '../../shared/research-page-window'
import type { TuiAgent } from '../../shared/tui-agent'

export type ResearchWindowApi = {
  /** Main window only. `fromDrag` opens it only when the pointer is outside the main window. */
  openWindow: (target: ResearchWindowTarget, options?: { fromDrag?: boolean }) => Promise<boolean>
  /** Main window: the store slices a research window renders from. */
  publishState: (state: unknown) => Promise<void>
  /** Research window: asks the main window to publish its state. */
  requestState: () => Promise<void>
  /** Research window: shows the same page in the main window, for what only that window can do. */
  revealInMain: (target: ResearchWindowTarget) => Promise<void>
  /** Research window: the main window starts a chat in this project, staying where it is. */
  launchChat: (target: ResearchWindowTarget, agent: TuiAgent) => Promise<ResearchWindowLaunchResult>
  /** Main window: how a chat start it ran for a research window ended. */
  reportLaunchChatResult: (requestId: string, result: ResearchWindowLaunchResult) => Promise<void>
  /** Main window: whether any research window is open, after this window reloaded. */
  hasOpenWindows: () => Promise<boolean>
  onState: (callback: (state: unknown) => void) => () => void
  onStateRequested: (callback: () => void) => () => void
  onAllClosed: (callback: () => void) => () => void
  onRevealInMain: (callback: (target: ResearchWindowTarget) => void) => () => void
  /** Main window: a research window asked for a chat in its project. */
  onLaunchChat: (
    callback: (target: ResearchWindowTarget, agent: TuiAgent, requestId: string) => void
  ) => () => void
  /** Research window: show this section, when the project's window was opened again. */
  onShowPage: (callback: (page: unknown) => void) => () => void
}

function subscribe<T extends unknown[]>(
  channel: string,
  callback: (...args: T) => void
): () => void {
  const listener = (_event: Electron.IpcRendererEvent, ...args: T): void => callback(...args)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

export const researchWindowApi: ResearchWindowApi = {
  openWindow: (target, options) =>
    ipcRenderer.invoke('researchWindow:open', target, options?.fromDrag === true),
  publishState: (state) => ipcRenderer.invoke('researchWindow:publishState', state),
  requestState: () => ipcRenderer.invoke('researchWindow:requestState'),
  revealInMain: (target) => ipcRenderer.invoke('researchWindow:revealInMain', target),
  launchChat: (target, agent) => ipcRenderer.invoke('researchWindow:launchChat', target, agent),
  reportLaunchChatResult: (requestId, result) =>
    ipcRenderer.invoke('researchWindow:reportLaunchChatResult', requestId, result),
  hasOpenWindows: () => ipcRenderer.invoke('researchWindow:hasOpenWindows'),
  onState: (callback) => subscribe<[unknown]>('researchWindow:state', callback),
  onStateRequested: (callback) => subscribe<[]>('researchWindow:stateRequested', callback),
  onAllClosed: (callback) => subscribe<[]>('researchWindow:allClosed', callback),
  onRevealInMain: (callback) =>
    subscribe<[ResearchWindowTarget]>('researchWindow:revealInMain', callback),
  onLaunchChat: (callback) =>
    subscribe<[ResearchWindowTarget, TuiAgent, string]>('researchWindow:launchChat', callback),
  onShowPage: (callback) => subscribe<[unknown]>('researchWindow:showPage', callback)
}
