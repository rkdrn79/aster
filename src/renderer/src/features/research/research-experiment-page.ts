import { useCallback, useSyncExternalStore } from 'react'
import { useAppStore } from '@/store'
import { openResearchView } from './research-navigation'

export const EXPERIMENT_DETAIL_PAGES = ['runs', 'compare', 'outputs'] as const
export type ExperimentDetailPage = (typeof EXPERIMENT_DETAIL_PAGES)[number]
/** The Experiment's notebook, or one of the Details it drills into. */
export type ExperimentPage = 'notebook' | ExperimentDetailPage

export const EXPERIMENT_PAGES = ['notebook', ...EXPERIMENT_DETAIL_PAGES] as const

export const EXPERIMENT_PAGE_LABELS: Record<ExperimentPage, string> = {
  notebook: 'Notebook',
  runs: 'Runs',
  compare: 'Compare',
  outputs: 'Outputs'
}

// Why module state: the page of each Experiment lasts for the session, across page switches.
const pages = new Map<string, ExperimentPage>()
const lastDetails = new Map<string, ExperimentDetailPage>()
// Why: switching Experiments keeps the page on screen instead of dropping back to the notebook.
let lastPage: ExperimentPage | null = null
const listeners = new Set<() => void>()
let version = 0

export function subscribeExperimentPages(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
const subscribe = subscribeExperimentPages

function snapshot(): number {
  return version
}

function rememberPage(experimentId: string, page: ExperimentPage): void {
  lastPage = page
  if (page !== 'notebook') {
    lastDetails.set(experimentId, page)
  }
  if (pages.get(experimentId) === page) {
    return
  }
  pages.set(experimentId, page)
  version += 1
  for (const listener of listeners) {
    listener()
  }
}

export function experimentPage(value: string): ExperimentPage | null {
  return EXPERIMENT_PAGES.find((page) => page === value) ?? null
}

/** Where the notebook/details toggle goes: Details reopen on the last one used. */
export function toggledExperimentPage(
  page: ExperimentPage,
  lastDetail: ExperimentDetailPage
): ExperimentPage {
  return page === 'notebook' ? lastDetail : 'notebook'
}

/** The Details page the notebook/details toggle reopens: the last one used here, else Runs. */
export function lastExperimentDetailPage(experimentId: string): ExperimentDetailPage {
  return lastDetails.get(experimentId) ?? 'runs'
}

/** Opens an Experiment on its notebook or a Details page, also when its screen already shows. */
export function openResearchExperimentPage(experimentId: string, page: ExperimentPage): void {
  rememberPage(experimentId, page)
  const view = page === 'compare' ? 'research-compare' : 'research-runs'
  if (useAppStore.getState().activeView !== view) {
    openResearchView(view)
  }
}

/** What the Experiment's screen shows in `view`: its last page, else the view's own start page. */
export function currentExperimentPage(
  experimentId: string,
  view: 'research-runs' | 'research-compare'
): ExperimentPage {
  return pages.get(experimentId) ?? (view === 'research-compare' ? 'compare' : 'notebook')
}

/** The page a switch to another Experiment opens: the one on screen while an Experiment shows. */
export function experimentSwitchPage(): ExperimentPage {
  const view = useAppStore.getState().activeView
  return (view === 'research-runs' || view === 'research-compare') && lastPage
    ? lastPage
    : 'notebook'
}

/**
 * The open page of the selected Experiment: the last one used for it, else the notebook (the
 * Compare view starts on Compare).
 */
export function useExperimentPage(
  experimentId: string | null,
  viewPage: 'runs' | 'compare'
): [ExperimentPage, (page: ExperimentPage) => void] {
  useSyncExternalStore(subscribe, snapshot, snapshot)
  const page =
    (experimentId ? pages.get(experimentId) : undefined) ??
    (viewPage === 'compare' ? 'compare' : 'notebook')
  const setPage = useCallback(
    (next: ExperimentPage) => {
      if (experimentId) {
        rememberPage(experimentId, next)
      }
    },
    [experimentId]
  )
  return [page, setPage]
}
