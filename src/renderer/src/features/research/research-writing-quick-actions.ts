// The Writing agent pane's quick actions and when each can run.

export type WritingQuickActionId =
  | 'method-from-code'
  | 'intro-from-skeleton'
  | 'results-from-runs'
  | 'tighten'
  | 'check'

export type WritingQuickAction = {
  id: WritingQuickActionId
  label: string
  /** One line for starter cards and tooltips. */
  detail: string
  /** Why it cannot run now; null when it can. */
  disabledReason: string | null
}

export type WritingQuickActionState = {
  hasManuscript: boolean
  hasSelection: boolean
  /** The harness bridge answers (local projects with a current preload). */
  harness: boolean
}

const ACTIONS: readonly Omit<WritingQuickAction, 'disabledReason'>[] = [
  {
    id: 'method-from-code',
    label: 'Write method from code',
    detail: 'Reads the folders you pick, asks what code cannot show'
  },
  {
    id: 'intro-from-skeleton',
    label: 'Write intro from skeleton',
    detail: 'Five-line logic you confirm, then the introduction'
  },
  {
    id: 'results-from-runs',
    label: 'Draft results from Runs',
    detail: 'Every number through a claim tied to its Run'
  },
  {
    id: 'tighten',
    label: 'Tighten selection',
    detail: 'Shorter, scoped and cited, without losing a claim'
  },
  {
    id: 'check',
    label: 'Check writing',
    detail: 'Lints citations, references, notation and claims'
  }
]

function disabledReason(id: WritingQuickActionId, state: WritingQuickActionState): string | null {
  if (!state.hasManuscript) {
    return 'Set the main TeX file first.'
  }
  switch (id) {
    case 'tighten':
      return state.hasSelection ? null : 'Select a passage in the TeX source first.'
    case 'check':
      return state.harness ? null : 'Writing check runs on local projects only.'
    case 'method-from-code':
    case 'intro-from-skeleton':
    case 'results-from-runs':
      return null
  }
}

export function writingQuickActions(state: WritingQuickActionState): WritingQuickAction[] {
  return ACTIONS.map((action) => ({ ...action, disabledReason: disabledReason(action.id, state) }))
}

/** The actions a new chat starts from: drafting ones, not edits of text that must exist first. */
export const WRITING_STARTER_ACTIONS: readonly WritingQuickActionId[] = [
  'method-from-code',
  'intro-from-skeleton',
  'results-from-runs'
]

/** A folder the person typed: project-relative, no absolute path and no `..`; null otherwise. */
export function writingCodeFolderInput(value: string): string | null {
  const folder = value
    .trim()
    .replace(/^\.\/+/, '')
    .replace(/\/+$/, '')
  if (!folder || folder.startsWith('/') || folder.split('/').includes('..')) {
    return null
  }
  return folder
}
