// Where a gradient or a feedback path ends. A backward path updates parameters, so it must end on
// the module that holds them (the MLP θ, the policy), not on a picture, a grid of values or the
// region around them: in round 14 DreamFusion's "backpropagate onto NeRF weights" arrow stopped
// at the colour grid c and the judges read that the gradient never reached the MLP. A path that
// ends on a frozen module (snowflake) contradicts the badge. A path into a region always ends on
// the wrong thing; one into a picture only when its label says it updates weights.
import { elementBounds, isInside } from './research-figures-geometry.mjs'

const ownerOf = (element) => element.customData?.asterKit ?? element.id
const BACKWARD = new Set(['grad', 'feedback'])
/** A label that says the path updates parameters. */
const WEIGHTS = /weight|param|\\theta|θ|backprop|update|가중치|파라미터/i
const roleOf = (arrow) => arrow.customData?.asterLine ?? arrow.customData?.asterRole ?? null

/** What an end item is: a 'region' (panel, group), 'data' (picture, grid, text, math) or 'module'. */
function kindOf(element) {
  const data = element.customData ?? {}
  if (data.asterPanel || data.asterContainer) {
    return 'region'
  }
  if (
    element.type === 'text' ||
    data.asterGrid ||
    data.asterTex ||
    (element.type === 'image' && (data.asterPhoto || data.asterPlot))
  ) {
    return 'data'
  }
  return 'module'
}

/** Modules inside a region, trained ones (a flame badge) first: what the path should reach. */
function modulesIn(region, elements, ids) {
  const box = elementBounds(region)
  const inside = elements.filter(
    (element) =>
      ownerOf(element) === element.id &&
      element.id !== region.id &&
      ['rectangle', 'ellipse', 'diamond', 'line'].includes(element.type) &&
      element.width >= 24 &&
      kindOf(element) === 'module' &&
      isInside(elementBounds(element), box)
  )
  return inside.toSorted(
    (a, b) => Number(ids.has(`${b.id}-trainable`)) - Number(ids.has(`${a.id}-trainable`))
  )
}

export function gradTargetChecks(elements, add) {
  const byId = new Map(elements.map((element) => [element.id, element]))
  const ids = new Set(byId.keys())
  const backward = elements.filter(
    (element) => element.type === 'arrow' && BACKWARD.has(roleOf(element))
  )
  // Why only the last arrow of a chain: a gradient through the rendering continues from it.
  const starts = new Set(
    backward.map((arrow) => ownerOf(byId.get(arrow.startBinding?.elementId) ?? arrow))
  )
  const reported = new Set()
  for (const arrow of backward) {
    const end = byId.get(arrow.endBinding?.elementId)
    if (!end) {
      continue
    }
    const target = byId.get(ownerOf(end)) ?? end
    if (starts.has(target.id) || reported.has(target.id)) {
      continue
    }
    const kind = kindOf(target)
    const role = roleOf(arrow)
    const owner = ownerOf(arrow)
    if (kind === 'module') {
      if (role === 'grad' && ids.has(`${target.id}-frozen`)) {
        reported.add(target.id)
        add(
          'warning',
          'grad-target',
          arrow,
          `the gradient ${owner} ends on ${target.id}, which is marked frozen; a gradient updates trained weights: end it on the module it trains (or drop the snowflake)`
        )
      }
      continue
    }
    // Why only when it says so: a gradient with respect to a picture (an SDS or SJC update on a
    // rendered view) is drawn to the picture; one that says it updates weights must reach them.
    const words = elements
      .filter((element) => ownerOf(element) === owner && element.id !== arrow.id)
      .map((element) => element.text ?? element.customData?.asterTex ?? '')
      .join(' ')
    if (kind === 'data' && !WEIGHTS.test(words)) {
      continue
    }
    reported.add(target.id)
    const inside = kind === 'region' ? modulesIn(target, elements, ids) : []
    const what =
      kind === 'region'
        ? `the region ${target.id}`
        : `${target.id}, a ${target.type === 'image' ? 'picture' : 'value'} rather than a module`
    add(
      'warning',
      'grad-target',
      arrow,
      `the ${role === 'grad' ? 'gradient' : 'feedback'} path ${owner} ends on ${what}; a backward path updates parameters, so carry it on to the module that holds them${
        inside.length
          ? ` (${inside
              .slice(0, 2)
              .map((item) => item.id)
              .join(' or ')})`
          : ' (the trained network, e.g. its MLP box)'
      } and say which weights in its label`
    )
  }
}
