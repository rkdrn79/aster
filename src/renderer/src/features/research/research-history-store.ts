import { create } from 'zustand'
import { useAppStore } from '@/store'
import { addAppKeyListener } from '@/lib/app-keyboard-router'
import { isEditableTarget } from '@/lib/editable-target'
import { isEventTargetInsideFloatingWorkspacePanel } from '@/lib/floating-workspace-terminal-actions'
import { getShortcutPlatform } from '@/lib/shortcut-platform'
import { shouldShowWorktreeHistoryControls } from '@/lib/titlebar-worktree-history-controls'
import { keybindingMatchesAction } from '../../../../shared/keybindings'
import { useResearchRecords } from './research-records-store'
import { subscribeExperimentPages } from './research-experiment-page'
import {
  EMPTY_RESEARCH_HISTORY,
  pushResearchLocation,
  replaceResearchLocation,
  researchHistoryTarget,
  type ResearchHistory,
  type ResearchLocation
} from './research-history'
import {
  applyResearchLocation,
  lastResearchLocation,
  readResearchLocation,
  researchLocationReachable,
  saveLastResearchLocation
} from './research-location'

type Direction = 'back' | 'forward'

/** Back/Forward through Research pages, Experiments and their pages for this session. */
export const useResearchHistory = create<{ history: ResearchHistory }>(() => ({
  history: EMPTY_RESEARCH_HISTORY
}))

// Why: one user action lands as several store updates (workspace, view, selection); settle first.
const SETTLE_MS = 60
let timer: ReturnType<typeof setTimeout> | null = null
let restoring = 0
let installed = false

function researchUiEnabled(): boolean {
  return useAppStore.getState().settings?.researchUiEnabled === true
}

function record(mode: 'push' | 'replace'): void {
  if (!researchUiEnabled()) {
    return
  }
  const location = readResearchLocation()
  if (!location) {
    return
  }
  saveLastResearchLocation(location)
  useResearchHistory.setState((state) => {
    const history =
      mode === 'push'
        ? pushResearchLocation(state.history, location)
        : replaceResearchLocation(state.history, location)
    return history === state.history ? state : { history }
  })
}

function scheduleRecord(): void {
  if (timer !== null) {
    clearTimeout(timer)
  }
  timer = setTimeout(() => {
    timer = null
    // Why: a Back/Forward in flight records where it lands once, not each step on the way.
    if (restoring === 0) {
      record('push')
    }
  }, SETTLE_MS)
}

/**
 * Runs a navigation without recording its intermediate steps, then records where it landed: as a
 * new entry, or (Back/Forward) as a correction of the entry it went to.
 */
function restore(mode: 'push' | 'replace', run: () => Promise<void>): void {
  restoring += 1
  // Why: run now, not in a microtask, so a caller's own navigation right after still wins.
  void run()
    .catch(() => undefined)
    .finally(() => {
      restoring -= 1
      if (restoring === 0) {
        record(mode)
      }
    })
}

export function canGoResearchHistory(history: ResearchHistory, direction: Direction): boolean {
  const state = useAppStore.getState()
  return (
    researchHistoryTarget(history, direction, (location) =>
      researchLocationReachable(location, state)
    ) !== null
  )
}

export function goResearchHistory(direction: Direction): void {
  const { history } = useResearchHistory.getState()
  const state = useAppStore.getState()
  const index = researchHistoryTarget(history, direction, (location) =>
    researchLocationReachable(location, state)
  )
  if (index === null) {
    return
  }
  useResearchHistory.setState({ history: { entries: history.entries, index } })
  const target = history.entries[index]
  restore('replace', () => applyResearchLocation(target))
}

/** The title bar's Back/Forward: page history in Research, workspace history in Code. */
export function goLayoutHistory(direction: Direction): void {
  if (researchUiEnabled()) {
    goResearchHistory(direction)
    return
  }
  const state = useAppStore.getState()
  if (direction === 'back') {
    state.goBackWorktree()
  } else {
    state.goForwardWorktree()
  }
}

/** Reopens a workspace where the Research layout last left it (view, Experiment, page). */
export function resumeResearchLocation(workspaceId: string): void {
  const saved = lastResearchLocation(workspaceId)
  if (!saved || saved.view === 'terminal' || !researchUiEnabled()) {
    return
  }
  const experiments = useResearchRecords.getState().document?.experiments
  const gone =
    saved.experimentId !== null &&
    experiments !== undefined &&
    !experiments.some((experiment) => experiment.id === saved.experimentId && !experiment.archived)
  const location: ResearchLocation = gone
    ? { ...saved, view: 'research-experiments', experimentId: null, page: null }
    : saved
  restore('push', () => applyResearchLocation(location, { openFirst: true }))
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.repeat || event.defaultPrevented || event.isComposing || !researchUiEnabled()) {
    return
  }
  const state = useAppStore.getState()
  const platform = getShortcutPlatform()
  const direction: Direction | null = keybindingMatchesAction(
    'research.history.back',
    event,
    platform,
    state.keybindings
  )
    ? 'back'
    : keybindingMatchesAction('research.history.forward', event, platform, state.keybindings)
      ? 'forward'
      : null
  const target = event.target instanceof Element ? event.target : null
  if (
    !direction ||
    state.activeModal !== 'none' ||
    !shouldShowWorktreeHistoryControls(state.activeView) ||
    // Why: editors outdent and terminals switch panes on the same chord.
    isEditableTarget(event.target) ||
    target?.closest('.xterm, [role="dialog"]') ||
    isEventTargetInsideFloatingWorkspacePanel(event.target)
  ) {
    return
  }
  event.preventDefault()
  event.stopPropagation()
  goResearchHistory(direction)
}

/** Starts recording Research locations and the Back/Forward chords; safe to call repeatedly. */
export function installResearchHistory(): void {
  if (installed) {
    return
  }
  installed = true
  useAppStore.subscribe((state, previous) => {
    if (
      state.activeView !== previous.activeView ||
      state.activeWorktreeId !== previous.activeWorktreeId ||
      state.settings?.researchUiEnabled !== previous.settings?.researchUiEnabled
    ) {
      scheduleRecord()
    }
  })
  useResearchRecords.subscribe((state, previous) => {
    if (state.document?.selectedExperimentId !== previous.document?.selectedExperimentId) {
      scheduleRecord()
    }
  })
  subscribeExperimentPages(scheduleRecord)
  addAppKeyListener('keydown', onKeyDown)
  scheduleRecord()
}
