import { ipcRenderer } from 'electron'
import type { ResearchWindowTarget } from '../../shared/research-page-window'

export type ResearchWindowApi = {
  /** Main window only. `fromDrag` opens it only when the pointer is outside the main window. */
  openWindow: (target: ResearchWindowTarget, options?: { fromDrag?: boolean }) => Promise<boolean>
  /** Main window: the store slices a research window renders from. */
  publishState: (state: unknown) => Promise<void>
  /** Research window: asks the main window to publish its state. */
  requestState: () => Promise<void>
  /** Research window: shows the same page in the main window, for what only that window can do. */
  revealInMain: (target: ResearchWindowTarget) => Promise<void>
  onState: (callback: (state: unknown) => void) => () => void
  onStateRequested: (callback: () => void) => () => void
  onAllClosed: (callback: () => void) => () => void
  onRevealInMain: (callback: (target: ResearchWindowTarget) => void) => () => void
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
  onState: (callback) => subscribe<[unknown]>('researchWindow:state', callback),
  onStateRequested: (callback) => subscribe<[]>('researchWindow:stateRequested', callback),
  onAllClosed: (callback) => subscribe<[]>('researchWindow:allClosed', callback),
  onRevealInMain: (callback) =>
    subscribe<[ResearchWindowTarget]>('researchWindow:revealInMain', callback)
}
