import { useEffect } from 'react'
import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import { getResolvedExecutionHostIdForWorktree } from '@/lib/resolved-worktree-execution-host'
import { createFigureBackgroundWatch } from './research-figure-background-watch'
import { createFigureRenderQueue } from './research-figure-render-queue'
import type { FigureTarget } from './research-figures-export'
import { buildResearchHomeProjects } from './research-home-projects'
import { projectOwnerKey, type ProjectFileOwner } from './research-project-files'
import { useResearchRecords } from './research-records-store'

/** Projects looked after at once, most recently opened first; each costs a look every 15 s. */
const MAX_PROJECTS = 24
/** How long an open editor gets to export an agent's write before the background does it. */
const EDITOR_GRACE_MS = 8000
const OWNERS_EVERY_TICKS = 10

/** Every research project Aster knows on this computer or a connected host. */
export function figureProjectOwners(state: AppState): ProjectFileOwner[] {
  const owners = new Map<string, ProjectFileOwner>()
  const add = (owner: ProjectFileOwner): void => {
    if (owners.size < MAX_PROJECTS && owner.workspacePath) {
      owners.set(projectOwnerKey(owner), owner)
    }
  }
  if (state.activeWorktreeId) {
    const hostId = getResolvedExecutionHostIdForWorktree(state, state.activeWorktreeId)
    const workspace = Object.values(state.worktreesByRepo)
      .flat()
      .find((entry) => entry.id === state.activeWorktreeId)
    if (hostId && workspace) {
      add({ hostId, workspaceId: workspace.id, workspacePath: workspace.path })
    }
  }
  for (const experiment of useResearchRecords.getState().document?.experiments ?? []) {
    if (!experiment.archived && experiment.workspaceId && experiment.hostId) {
      add({
        hostId: experiment.hostId,
        workspaceId: experiment.workspaceId,
        workspacePath: experiment.workspacePath
      })
    }
  }
  for (const project of buildResearchHomeProjects(state)) {
    for (const workspace of project.workspaces) {
      const hostId = getResolvedExecutionHostIdForWorktree(state, workspace.id)
      if (hostId) {
        add({ hostId, workspaceId: workspace.id, workspacePath: workspace.path })
      }
    }
  }
  return [...owners.values()]
}

const jobKey = (target: FigureTarget): string =>
  `${projectOwnerKey(target.owner)}|${target.folder}|${target.slug}`

/**
 * Renders figure previews with no Figures page open, for agents drawing on any project Aster
 * knows (this computer or a server): watches scenes, debounces, renders one at a time off-screen
 * through the editor's own export, and stamps each project so the harness knows it is here.
 */
export default function ResearchFigureBackgroundRenderer(): null {
  useEffect(() => {
    const api = window.api.researchFigures
    if (!api?.onBackgroundTick || !api.renderExports) {
      return
    }
    const queue = createFigureRenderQueue<FigureTarget>({
      run: async (job) => {
        const { renderFigureInBackground } = await import('./research-figure-background-render')
        const result = await renderFigureInBackground(job.value, {
          editorGraceOver: job.attempt > 0
        })
        return result === 'deferred' ? { retryInMs: EDITOR_GRACE_MS } : 'done'
      }
    })
    const watch = createFigureBackgroundWatch({
      render: (request) =>
        queue.schedule(jobKey(request.target), request.target, {
          priority: request.priority,
          ...(request.delayMs === undefined ? {} : { delayMs: request.delayMs })
        })
    })
    let ticks = 0
    return api.onBackgroundTick(() => {
      if (ticks % OWNERS_EVERY_TICKS === 0) {
        watch.setProjects(figureProjectOwners(useAppStore.getState()))
      }
      ticks += 1
      watch.tick()
      queue.pump()
    })
  }, [])
  return null
}
