import { PAGE_FRAME_ID } from '../../../../research-harness/research-figures-model.mjs'
import type { FigureQuickRequest } from './research-figures-agent-prompts'

/** What is on the canvas, as far as the agent's quick actions care. */
export type FigureCanvasState = 'none' | 'empty' | 'sketch' | 'drawn'

export type FigureQuickActionId = FigureQuickRequest | 'recreate'

export type FigureQuickAction = {
  id: FigureQuickActionId
  label: string
  /** Why it cannot run now; null when it can. */
  disabledReason: string | null
}

type CanvasElement = {
  id: string
  type: string
  isDeleted?: boolean
  customData?: Record<string, unknown> | null
}

const LABELS: Record<FigureQuickActionId, string> = {
  'draw-method': 'Draw from the method section',
  'clean-up': 'Clean up for the paper',
  sketch: 'Turn my sketch into a diagram',
  plot: 'Plot from Runs',
  recreate: 'Recreate from image'
}
const ORDER: readonly FigureQuickActionId[] = [
  'draw-method',
  'recreate',
  'clean-up',
  'sketch',
  'plot'
]
const PRIMARY: Record<FigureCanvasState, readonly FigureQuickActionId[]> = {
  none: ['draw-method', 'plot'],
  empty: ['draw-method', 'recreate'],
  sketch: ['sketch', 'clean-up'],
  drawn: ['clean-up', 'draw-method']
}

/** Kit photos and math are drawn images; a sketch is freehand or an image the user brought. */
function isSketch(element: CanvasElement): boolean {
  if (element.type === 'freedraw') {
    return true
  }
  const kit = Object.keys(element.customData ?? {}).some((key) => key.startsWith('aster'))
  return element.type === 'image' && !kit
}

export function figureCanvasState(elements: readonly CanvasElement[] | null): FigureCanvasState {
  if (!elements) {
    return 'none'
  }
  const content = elements.filter((element) => !element.isDeleted && element.id !== PAGE_FRAME_ID)
  if (!content.length) {
    return 'empty'
  }
  return content.some(isSketch) ? 'sketch' : 'drawn'
}

function disabledReason(id: FigureQuickActionId, state: FigureCanvasState): string | null {
  switch (id) {
    case 'draw-method':
    case 'plot':
      return null
    case 'recreate':
      return state === 'none' ? 'Open or create a figure first.' : null
    case 'clean-up':
      return state === 'none'
        ? 'Open a figure first.'
        : state === 'empty'
          ? 'Nothing to clean up yet.'
          : null
    case 'sketch':
      return state === 'none'
        ? 'Open a figure first.'
        : state === 'sketch'
          ? null
          : 'Paste or draw a sketch on the canvas first.'
  }
}

/** Two actions that fit what is on the canvas, and the rest for More, each with its reason. */
export function figureQuickActions(state: FigureCanvasState): {
  primary: FigureQuickAction[]
  more: FigureQuickAction[]
} {
  const action = (id: FigureQuickActionId): FigureQuickAction => ({
    id,
    label: LABELS[id],
    disabledReason: disabledReason(id, state)
  })
  const primary = PRIMARY[state]
  return {
    primary: primary.map(action),
    more: ORDER.filter((id) => !primary.includes(id)).map(action)
  }
}
