import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import { findWorktreeById } from '@/store/slices/worktree-helpers'
import { selectFolderWorkspaces, selectWorktreesByRepo } from '@/store/workspace-record-selectors'
import { getResolvedExecutionHostIdForWorktree } from '@/lib/resolved-worktree-execution-host'
import { activateAndRevealWorkspace } from '@/lib/worktree-activation'
import { parseWorkspaceKey } from '../../../../shared/workspace-scope'
import { useResearchRecords } from './research-records-store'
import { currentExperimentPage, openResearchExperimentPage } from './research-experiment-page'
import { selectResearchExperimentRecord } from './research-experiment-select'
import { isResearchHomePage, openResearchHome, openResearchView } from './research-navigation'
import { isExperimentPage, researchLocation, type ResearchLocation } from './research-history'

const LAST_LOCATION_KEY = 'aster.research-last-location.v1'
const MAX_SAVED_WORKSPACES = 200

type SavedLocation = Omit<ResearchLocation, 'workspaceId'>

const PROJECT_VIEWS: readonly ResearchLocation['view'][] = [
  'terminal',
  'research-writing',
  'research-library',
  'research-experiments',
  'research-runs',
  'research-compare'
]

/** Where the Research layout is now, or null outside it (Settings, Code pages). */
export function readResearchLocation(
  state: AppState = useAppStore.getState()
): ResearchLocation | null {
  const workspaceId = state.activeWorktreeId
  const hostId = getResolvedExecutionHostIdForWorktree(state, workspaceId)
  const document = useResearchRecords.getState().document
  const selected = document?.experiments.find(
    (experiment) =>
      experiment.id === document.selectedExperimentId &&
      experiment.workspaceId === workspaceId &&
      experiment.hostId === hostId
  )
  return researchLocation({
    workspaceId,
    view: state.activeView,
    experimentId: selected?.id ?? null,
    pageOf: currentExperimentPage
  })
}

/** The workspace still exists, so Back can open it. */
export function researchLocationReachable(location: ResearchLocation, state: AppState): boolean {
  const { workspaceId } = location
  if (workspaceId === null) {
    return true
  }
  const scope = parseWorkspaceKey(workspaceId)
  if (scope?.type === 'folder') {
    return selectFolderWorkspaces(state).some(
      (workspace) => workspace.id === scope.folderWorkspaceId
    )
  }
  return findWorktreeById(selectWorktreesByRepo(state), workspaceId) !== undefined
}

function readSaved(): Record<string, SavedLocation> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(LAST_LOCATION_KEY) ?? '{}')
    if (!parsed || typeof parsed !== 'object') {
      return {}
    }
    const saved: Record<string, SavedLocation> = {}
    for (const [workspaceId, value] of Object.entries(parsed)) {
      const location = parseSavedLocation(value)
      if (location) {
        saved[workspaceId] = location
      }
    }
    return saved
  } catch {
    return {}
  }
}

export function parseSavedLocation(value: unknown): SavedLocation | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const savedView: unknown = Reflect.get(value, 'view')
  const experimentId: unknown = Reflect.get(value, 'experimentId')
  const page: unknown = Reflect.get(value, 'page')
  const view = PROJECT_VIEWS.find((entry) => entry === savedView)
  if (!view) {
    return null
  }
  if (typeof experimentId === 'string' && isExperimentPage(page)) {
    return { view, experimentId, page }
  }
  return { view, experimentId: null, page: null }
}

/** Remembered per workspace on this device, so a project reopens where it was left. */
export function saveLastResearchLocation(location: ResearchLocation): void {
  if (location.workspaceId === null) {
    return
  }
  const saved = readSaved()
  delete saved[location.workspaceId]
  saved[location.workspaceId] = {
    view: location.view,
    experimentId: location.experimentId,
    page: location.page
  }
  const keys = Object.keys(saved)
  for (const key of keys.slice(0, Math.max(0, keys.length - MAX_SAVED_WORKSPACES))) {
    delete saved[key]
  }
  try {
    localStorage.setItem(LAST_LOCATION_KEY, JSON.stringify(saved))
  } catch {
    // Why: a full storage only means the project reopens on its Workbench.
  }
}

export function lastResearchLocation(workspaceId: string): ResearchLocation | null {
  const saved = readSaved()[workspaceId]
  return saved ? { workspaceId, ...saved } : null
}

/**
 * Opens a location; settles once its Experiment selection is saved. `openFirst` shows the page
 * before that save, so a caller that navigates right after still wins.
 */
export async function applyResearchLocation(
  location: ResearchLocation,
  { openFirst = false }: { openFirst?: boolean } = {}
): Promise<void> {
  const state = useAppStore.getState()
  if (location.workspaceId === null) {
    openResearchHome(isResearchHomePage(location.view) ? location.view : 'terminal')
    return
  }
  if (
    state.activeWorktreeId !== location.workspaceId &&
    activateAndRevealWorkspace(location.workspaceId, { navigationIntent: 'user-open' }) === false
  ) {
    return
  }
  if (location.experimentId && location.page) {
    const { experimentId, page } = location
    if (openFirst) {
      openResearchExperimentPage(experimentId, page)
    }
    // Why: otherwise select first so the Experiment screen never flashes the previous one.
    await selectResearchExperimentRecord(experimentId).catch(() => undefined)
    if (!openFirst) {
      openResearchExperimentPage(experimentId, page)
    }
    return
  }
  openResearchView(location.view)
}
