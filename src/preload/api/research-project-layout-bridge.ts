import { ipcRenderer } from 'electron'
import type { ResearchLayoutMigration } from '../../research-harness/research-migrate.mjs'

export type ResearchProjectLayoutApi = {
  /**
   * `manuscript` points the catalog at an existing .tex; `createPaper: false` writes no template.
   * A main process older than these options rejects them; restart Aster after updating.
   */
  initialize: (params: {
    workspacePath: string
    manuscript?: string
    createPaper?: boolean
  }) => Promise<{
    manuscriptSource: string
    catalogPath: string
    status: Record<string, 'created' | 'existing'>
  }>
  createExperiment: (params: {
    workspacePath: string
    name: string
  }) => Promise<{ slug: string; status: 'created' | 'existing' }>
  /** The harness catalog of a local project (version 1 shape); throws when it has none. */
  readCatalog: (params: { workspacePath: string }) => Promise<unknown>
  /** Moves a pre-ADR-004 research/ tree to .aster/ and paper/; `dryRun` only plans. */
  migrate: (params: { workspacePath: string; dryRun: boolean }) => Promise<ResearchLayoutMigration>
}

export const researchProjectLayoutApi: ResearchProjectLayoutApi = {
  initialize: (params) => ipcRenderer.invoke('researchProjectLayout:initialize', params),
  createExperiment: (params) =>
    ipcRenderer.invoke('researchProjectLayout:createExperiment', params),
  readCatalog: (params) => ipcRenderer.invoke('researchProjectLayout:readCatalog', params),
  migrate: (params) => ipcRenderer.invoke('researchProjectLayout:migrate', params)
}
