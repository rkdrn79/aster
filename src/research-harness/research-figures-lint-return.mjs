// Return arrows (a gradient, a feedback, anything that runs back against the flow) that reach
// across most of the figure: a long loop round everything reads as wiring, not as the method.
// Published figures end such a path on the nearest part it updates, keep it in the clear band
// beside the row, or say it with a short labelled arrow or a note.
import { absolutePoints } from './research-figures-labels.mjs'

/** A return path may reach across this share of the page width. */
export const RETURN_REACH = 0.5
const RETURN_ROLES = new Set(['grad', 'feedback'])

/** Whether an arrow runs back: a gradient or feedback role, or a path that bends round to go left. */
function returning(arrow, path) {
  if (RETURN_ROLES.has(arrow.customData?.asterLine)) {
    return true
  }
  const bends = path.length - 2
  return bends >= 2 && path.at(-1)[0] < path[0][0] - 24
}

/** `long-return` for each return arrow reaching across more than half the page. */
export function returnChecks(elements, page, add) {
  if (!page?.width) {
    return
  }
  for (const arrow of elements) {
    if (arrow.type !== 'arrow' || arrow.isDeleted || !arrow.endArrowhead) {
      continue
    }
    const path = absolutePoints(arrow)
    if (path.length < 2 || !returning(arrow, path)) {
      continue
    }
    const xs = path.map(([x]) => x)
    const reach = Math.max(...xs) - Math.min(...xs)
    if (reach <= RETURN_REACH * page.width) {
      continue
    }
    const share = Math.round((reach / page.width) * 100)
    const ends = [arrow.startBinding?.elementId, arrow.endBinding?.elementId]
      .map((id) => id ?? 'a point')
      .join(' → ')
    add(
      'warning',
      'long-return',
      arrow,
      `runs back across ${share}% of the page (${ends}); end it on the nearest part it updates (the group or module beside its source), keep it in the clear band beside the row (route: 'under' | 'over'), or say it with a short labelled arrow or a note; fig.allow('long-return', [id]) only when the published figure draws it so`
    )
  }
}
