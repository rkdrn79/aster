import type { TopLevelView } from '../../../../shared/ui-chrome-types'
import { EXPERIMENT_PAGES, type ExperimentPage } from './research-experiment-page'
import { isResearchPage, type ResearchPage } from './research-navigation'

/** One place in the Research layout: a project page, or an Experiment on one of its pages. */
export type ResearchLocation = {
  /** null on the project home. */
  workspaceId: string | null
  view: 'terminal' | ResearchPage
  experimentId: string | null
  page: ExperimentPage | null
}

export type ResearchHistory = {
  readonly entries: readonly ResearchLocation[]
  /** The entry on screen; -1 while empty. */
  readonly index: number
}

// Why: a session rarely goes past a few dozen hops, and the cap keeps scans trivial.
export const MAX_RESEARCH_HISTORY = 50
export const EMPTY_RESEARCH_HISTORY: ResearchHistory = { entries: [], index: -1 }

export function sameResearchLocation(left: ResearchLocation, right: ResearchLocation): boolean {
  return (
    left.workspaceId === right.workspaceId &&
    left.view === right.view &&
    left.experimentId === right.experimentId &&
    left.page === right.page
  )
}

/**
 * The location a view shows. Experiment screens carry the Experiment and its page, and both
 * Experiment views fold into the one its page implies so a revisit compares equal.
 */
export function researchLocation(input: {
  workspaceId: string | null
  view: TopLevelView
  experimentId: string | null
  pageOf: (experimentId: string, view: 'research-runs' | 'research-compare') => ExperimentPage
}): ResearchLocation | null {
  const { workspaceId, view, experimentId } = input
  if (view !== 'terminal' && !isResearchPage(view)) {
    return null
  }
  if ((view === 'research-runs' || view === 'research-compare') && experimentId) {
    const page = input.pageOf(experimentId, view)
    return {
      workspaceId,
      view: page === 'compare' ? 'research-compare' : 'research-runs',
      experimentId,
      page
    }
  }
  return { workspaceId, view, experimentId: null, page: null }
}

/** Appends a visit, dropping the forward branch; revisiting the current entry is a no-op. */
export function pushResearchLocation(
  history: ResearchHistory,
  location: ResearchLocation
): ResearchHistory {
  const current = history.entries[history.index]
  if (current && sameResearchLocation(current, location)) {
    return history
  }
  const entries = [...history.entries.slice(0, history.index + 1), location]
  const evicted = Math.max(0, entries.length - MAX_RESEARCH_HISTORY)
  return { entries: entries.slice(evicted), index: entries.length - 1 - evicted }
}

/** Corrects the current entry to what a Back/Forward actually reached, keeping both branches. */
export function replaceResearchLocation(
  history: ResearchHistory,
  location: ResearchLocation
): ResearchHistory {
  const current = history.entries[history.index]
  if (!current) {
    return pushResearchLocation(history, location)
  }
  if (sameResearchLocation(current, location)) {
    return history
  }
  const entries = history.entries.slice()
  entries[history.index] = location
  return { entries, index: history.index }
}

/** The nearest reachable entry behind or ahead of the current one. */
export function researchHistoryTarget(
  history: ResearchHistory,
  direction: 'back' | 'forward',
  reachable: (location: ResearchLocation) => boolean
): number | null {
  const step = direction === 'back' ? -1 : 1
  for (let i = history.index + step; i >= 0 && i < history.entries.length; i += step) {
    if (reachable(history.entries[i])) {
      return i
    }
  }
  return null
}

export function isExperimentPage(value: unknown): value is ExperimentPage {
  return EXPERIMENT_PAGES.some((page) => page === value)
}
