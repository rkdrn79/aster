import { ipcRenderer } from 'electron'
import type {
  ResearchWindowChatOptions,
  ResearchWindowLaunchResult,
  ResearchWindowTarget
} from '../../shared/research-page-window'
import type { TuiAgent } from '../../shared/tui-agent'
import type { ResearchSideCommand } from '../../shared/research-side-split'
import type {
  ResearchWindowAction,
  ResearchWindowActionResult
} from '../../shared/research-window-actions'

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
  launchChat: (
    target: ResearchWindowTarget,
    agent: TuiAgent,
    options?: ResearchWindowChatOptions
  ) => Promise<ResearchWindowLaunchResult>
  /** Main window: how a chat start it ran for a research window ended. */
  reportLaunchChatResult: (requestId: string, result: ResearchWindowLaunchResult) => Promise<void>
  /** Research window: the main window makes, closes or renames a tab, or opens a file, for it. */
  runAction: (action: ResearchWindowAction) => Promise<ResearchWindowActionResult>
  /** Main window: how an action it ran for a research window went. */
  reportActionResult: (requestId: string, result: ResearchWindowActionResult) => Promise<void>
  /** Main window: whether any research window is open, after this window reloaded. */
  hasOpenWindows: () => Promise<boolean>
  onState: (callback: (state: unknown) => void) => () => void
  onStateRequested: (callback: () => void) => () => void
  onAllClosed: (callback: () => void) => () => void
  onRevealInMain: (callback: (target: ResearchWindowTarget) => void) => () => void
  /** Main window: a research window asked for a chat in its project. */
  onLaunchChat: (
    callback: (
      target: ResearchWindowTarget,
      agent: TuiAgent,
      requestId: string,
      options: ResearchWindowChatOptions | undefined
    ) => void
  ) => () => void
  /** Main window: a research window asked it to run an action on the tabs. */
  onRunAction: (callback: (action: ResearchWindowAction, requestId: string) => void) => () => void
  /** Research window: show this section, when the project's window was opened again. */
  onShowPage: (callback: (page: unknown) => void) => () => void
  /** Project side: open this chat of the side's project, as a notification click asks. */
  onShowChat: (callback: (tabId: unknown) => void) => () => void
  /** Project side: whether the main window gave this side the keyboard. */
  onSideFocused: (callback: (focused: unknown) => void) => () => void
  /** Project side: room to keep clear on the right for the main window's controls. */
  onSideInset: (callback: (px: unknown) => void) => () => void
  /** Project side: asks the main window it sits in to focus, close or move it. */
  sideCommand: (command: ResearchSideCommand) => Promise<void>
  /** Main window: a project side asked for something; `command` is checked by main. */
  onSideCommand: (callback: (sideId: string, command: ResearchSideCommand) => void) => () => void
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
  launchChat: (target, agent, options) =>
    ipcRenderer.invoke('researchWindow:launchChat', target, agent, options),
  reportLaunchChatResult: (requestId, result) =>
    ipcRenderer.invoke('researchWindow:reportLaunchChatResult', requestId, result),
  runAction: (action) => ipcRenderer.invoke('researchWindow:runAction', action),
  reportActionResult: (requestId, result) =>
    ipcRenderer.invoke('researchWindow:reportActionResult', requestId, result),
  hasOpenWindows: () => ipcRenderer.invoke('researchWindow:hasOpenWindows'),
  onState: (callback) => subscribe<[unknown]>('researchWindow:state', callback),
  onStateRequested: (callback) => subscribe<[]>('researchWindow:stateRequested', callback),
  onAllClosed: (callback) => subscribe<[]>('researchWindow:allClosed', callback),
  onRevealInMain: (callback) =>
    subscribe<[ResearchWindowTarget]>('researchWindow:revealInMain', callback),
  onLaunchChat: (callback) =>
    subscribe<[ResearchWindowTarget, TuiAgent, string, ResearchWindowChatOptions | undefined]>(
      'researchWindow:launchChat',
      callback
    ),
  onRunAction: (callback) =>
    subscribe<[ResearchWindowAction, string]>('researchWindow:runAction', callback),
  onShowPage: (callback) => subscribe<[unknown]>('researchWindow:showPage', callback),
  onShowChat: (callback) => subscribe<[unknown]>('researchWindow:showChat', callback),
  onSideInset: (callback) => subscribe<[unknown]>('researchWindow:sideInset', callback),
  onSideFocused: (callback) => subscribe<[unknown]>('researchWindow:sideFocused', callback),
  sideCommand: (command) => ipcRenderer.invoke('researchWindow:sideCommand', command),
  onSideCommand: (callback) =>
    subscribe<[string, ResearchSideCommand]>('researchWindow:sideCommand', callback)
}
