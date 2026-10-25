import { ipcRenderer } from 'electron'
import type {
  SlackConnectionStatus,
  SlackProjectRoute
} from '../../shared/slack-project-connection'

export type ResearchSlackApi = {
  get: () => Promise<SlackConnectionStatus>
  credentials: (input: { appToken: string; botToken: string }) => Promise<SlackConnectionStatus>
  disconnect: () => Promise<SlackConnectionStatus>
  saveProject: (route: SlackProjectRoute) => Promise<SlackConnectionStatus>
  removeProject: (projectKey: string) => Promise<SlackConnectionStatus>
}

export const researchSlackApi: ResearchSlackApi = {
  get: () => ipcRenderer.invoke('researchSlack:get'),
  credentials: (input) => ipcRenderer.invoke('researchSlack:credentials', input),
  disconnect: () => ipcRenderer.invoke('researchSlack:disconnect'),
  saveProject: (route) => ipcRenderer.invoke('researchSlack:saveProject', route),
  removeProject: (projectKey) => ipcRenderer.invoke('researchSlack:removeProject', projectKey)
}
