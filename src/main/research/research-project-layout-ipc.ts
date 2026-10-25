import { ipcMain } from 'electron'
import { z } from 'zod'
import { resolveDesktopAuthorizedPath } from '../ipc/local-file-access-resolution'
import { mainProcessState } from '../startup/main-process-state'
import { readCatalog } from '../../research-harness/research-catalog.mjs'
import { migrateProjectLayout } from '../../research-harness/research-migrate.mjs'
import {
  createExperiment,
  initializeResearchProject
} from '../../research-harness/research-project.mjs'

const workspaceSchema = z.object({ workspacePath: z.string().min(1).max(4096) }).strict()
const initializeSchema = workspaceSchema.extend({
  manuscript: z.string().min(1).max(4096).optional(),
  createPaper: z.boolean().optional()
})
const experimentSchema = workspaceSchema.extend({ name: z.string().trim().min(1).max(120) })
const migrateSchema = workspaceSchema.extend({ dryRun: z.boolean() })

async function authorizedProjectPath(workspacePath: string): Promise<string> {
  const store = mainProcessState.store
  if (!store) {
    throw new Error('Project storage is not ready. Try again after startup.')
  }
  return resolveDesktopAuthorizedPath(workspacePath, store)
}

export function registerResearchProjectLayoutIpcHandlers(): void {
  ipcMain.handle('researchProjectLayout:initialize', async (_event, input: unknown) => {
    const { workspacePath, manuscript, createPaper } = initializeSchema.parse(input)
    const project = await authorizedProjectPath(workspacePath)
    const result = await initializeResearchProject(project, { manuscript }, { createPaper })
    return {
      manuscriptSource: result.files.manuscriptSource,
      catalogPath: result.files.catalog,
      status: result.status
    }
  })
  ipcMain.handle('researchProjectLayout:createExperiment', async (_event, input: unknown) => {
    const { workspacePath, name } = experimentSchema.parse(input)
    const project = await authorizedProjectPath(workspacePath)
    // Why: a new Experiment must not leave a template paper/main.tex the user never asked for.
    const result = await createExperiment(project, name, { createPaper: false })
    return { slug: result.slug, status: result.status }
  })
  ipcMain.handle('researchProjectLayout:readCatalog', async (_event, input: unknown) => {
    const { workspacePath } = workspaceSchema.parse(input)
    try {
      return await readCatalog(await authorizedProjectPath(workspacePath))
    } catch (error) {
      // Why: a plain project is normal and polled; a rejected invoke would log an error each time.
      if (error instanceof Error && Reflect.get(error, 'code') === 'project_not_found') {
        return null
      }
      throw error
    }
  })
  ipcMain.handle('researchProjectLayout:migrate', async (_event, input: unknown) => {
    const { workspacePath, dryRun } = migrateSchema.parse(input)
    return migrateProjectLayout(await authorizedProjectPath(workspacePath), { dryRun })
  })
}
