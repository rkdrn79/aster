import { ipcRenderer } from 'electron'
import type {
  SlackConnectionStatus,
  SlackProjectRoute,
  SlackRemoteProjectStatus
} from '../../shared/slack-project-connection'

export type ResearchSlackApi = {
  get: () => Promise<SlackConnectionStatus>
  credentials: (input: { appToken: string; botToken: string }) => Promise<SlackConnectionStatus>
  disconnect: () => Promise<SlackConnectionStatus>
  /** Keep Slack connected through a per-user service while the app is closed. */
  setBackground: (enabled: boolean) => Promise<SlackConnectionStatus>
  saveProject: (route: SlackProjectRoute) => Promise<SlackConnectionStatus>
  removeProject: (projectKey: string) => Promise<SlackConnectionStatus>
  getRemoteProject: (input: {
    executionHostId: string
    projectKey: string
  }) => Promise<SlackRemoteProjectStatus>
  saveRemoteProject: (input: {
    route: SlackProjectRoute
    appToken: string
    botToken: string
  }) => Promise<SlackRemoteProjectStatus>
  removeRemoteProject: (input: {
    executionHostId: string
    projectKey: string
  }) => Promise<SlackRemoteProjectStatus>
}

export const researchSlackApi: ResearchSlackApi = {
  get: () => ipcRenderer.invoke('researchSlack:get'),
  credentials: (input) => ipcRenderer.invoke('researchSlack:credentials', input),
  disconnect: () => ipcRenderer.invoke('researchSlack:disconnect'),
  setBackground: (enabled) => ipcRenderer.invoke('researchSlack:background', enabled),
  saveProject: (route) => ipcRenderer.invoke('researchSlack:saveProject', route),
  removeProject: (projectKey) => ipcRenderer.invoke('researchSlack:removeProject', projectKey),
  getRemoteProject: (input) => ipcRenderer.invoke('researchSlack:getRemoteProject', input),
  saveRemoteProject: (input) => ipcRenderer.invoke('researchSlack:saveRemoteProject', input),
  removeRemoteProject: (input) => ipcRenderer.invoke('researchSlack:removeRemoteProject', input)
}
