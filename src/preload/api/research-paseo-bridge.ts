import { ipcRenderer } from 'electron'
import type {
  PaseoCompanionAgent,
  PaseoCompanionProvider,
  PaseoCompanionScope
} from '../../shared/research/research-paseo-companion'

export type ResearchPaseoApi = {
  list: (scope: PaseoCompanionScope) => Promise<PaseoCompanionAgent[]>
  listHost: (scope: PaseoCompanionScope) => Promise<PaseoCompanionAgent[]>
  providers: (scope: PaseoCompanionScope) => Promise<PaseoCompanionProvider[]>
  pair: (scope: PaseoCompanionScope) => Promise<string>
  setup: (scope: PaseoCompanionScope) => Promise<void>
  start: (scope: PaseoCompanionScope, prompt: string, provider: string) => Promise<string>
  logs: (scope: PaseoCompanionScope, agentId: string) => Promise<string>
  logsHost: (scope: PaseoCompanionScope, agentId: string) => Promise<string>
  send: (scope: PaseoCompanionScope, agentId: string, message: string) => Promise<void>
  sendHost: (scope: PaseoCompanionScope, agentId: string, message: string) => Promise<void>
}

export const researchPaseoApi: ResearchPaseoApi = {
  list: (scope) => ipcRenderer.invoke('researchPaseo:list', scope),
  listHost: (scope) => ipcRenderer.invoke('researchPaseo:listHost', scope),
  providers: (scope) => ipcRenderer.invoke('researchPaseo:providers', scope),
  pair: (scope) => ipcRenderer.invoke('researchPaseo:pair', scope),
  setup: (scope) => ipcRenderer.invoke('researchPaseo:setup', scope),
  start: (scope, prompt, provider) =>
    ipcRenderer.invoke('researchPaseo:start', scope, prompt, provider),
  logs: (scope, agentId) => ipcRenderer.invoke('researchPaseo:logs', scope, agentId),
  logsHost: (scope, agentId) => ipcRenderer.invoke('researchPaseo:logsHost', scope, agentId),
  send: (scope, agentId, message) =>
    ipcRenderer.invoke('researchPaseo:send', scope, agentId, message),
  sendHost: (scope, agentId, message) =>
    ipcRenderer.invoke('researchPaseo:sendHost', scope, agentId, message)
}
