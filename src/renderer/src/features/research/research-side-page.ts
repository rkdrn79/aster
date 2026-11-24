import type { TopLevelView } from '../../../../shared/ui-chrome-types'
import {
  isResearchWindowPage,
  type ResearchWindowPage
} from '../../../../shared/research-page-window'

/**
 * The page a side reports to the main window for its current view: its Workbench is its Chats,
 * and an Experiment's own pages (runs, compare) belong to Experiments.
 */
export function researchSidePageForView(
  view: TopLevelView,
  fallback: ResearchWindowPage
): ResearchWindowPage {
  if (view === 'terminal') {
    return 'research-chats'
  }
  if (view === 'research-runs' || view === 'research-compare') {
    return 'research-experiments'
  }
  return isResearchWindowPage(view) ? view : fallback
}
