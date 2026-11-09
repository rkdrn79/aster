// What the agent or the person drew on purpose, so the lint stops flagging it: a rule turned off
// for some items (a d×d square that carries meaning is not an empty box), for the whole
// figure, or for one stretch of the page (unused experts leave a gap by design).
import { PAGE_FRAME_ID } from './research-figures-model.mjs'

const unique = (values) => [...new Set(values)]

/**
 * The findings that can be a choice (a d×d square, a gap, a tall page the person wants); errors
 * and the rest are fixed, never allowed.
 */
export const ALLOWABLE_CODES = [
  'empty-box',
  'empty-region',
  'empty-space',
  'uneven-spacing',
  'page-fill',
  'tall-figure',
  'small-thumbnail',
  'long-dash',
  'text-size',
  'prose',
  'legend',
  'flat-background'
]

export function allowMethods(core) {
  const pageFrame = () => {
    const id = core.page()?.id ?? PAGE_FRAME_ID
    return core.elements.find((element) => element.id === id && !element.isDeleted) ?? null
  }
  return {
    /**
     * Marks a finding as intended: `fig.allow('empty-box', ['W'])` for these items (everything
     * drawn under each id), `fig.allow('empty-region', { x, y, w, h })` for a stretch of the
     * page, `fig.allow('tall-figure')` for the whole figure. Kept on the elements and the page,
     * so the lint, `figures check` and the canvas agree; `fig.reset()` keeps the page's.
     */
    allow(rule, target) {
      if (!ALLOWABLE_CODES.includes(rule)) {
        throw new Error(
          `allow(rule, ids | { x, y, w, h }) takes one of ${ALLOWABLE_CODES.join(', ')}; fix the other findings`
        )
      }
      if (Array.isArray(target) || typeof target === 'string') {
        for (const id of [target].flat()) {
          const parts = core.owned(id)
          if (!parts.length) {
            core.need(id)
          }
          for (const element of parts) {
            element.customData = {
              ...element.customData,
              asterAllow: unique([...(element.customData?.asterAllow ?? []), rule])
            }
          }
        }
        return
      }
      const page = pageFrame()
      if (!page) {
        throw new Error('allow() for the whole figure needs a page frame')
      }
      if (target && typeof target === 'object') {
        const { x, y } = target
        const width = target.w ?? target.width
        const height = target.h ?? target.height
        if (![x, y, width, height].every(Number.isFinite)) {
          throw new Error('allow(rule, { x, y, w, h }) needs numbers for the stretch it allows')
        }
        const areas = (page.customData?.asterAllowAreas ?? []).filter(
          (entry) =>
            !(
              entry.rule === rule &&
              entry.x === x &&
              entry.y === y &&
              entry.width === width &&
              entry.height === height
            )
        )
        page.customData = {
          ...page.customData,
          asterAllowAreas: [...areas, { rule, x, y, width, height }]
        }
        return
      }
      page.customData = {
        ...page.customData,
        asterAllow: unique([...(page.customData?.asterAllow ?? []), rule])
      }
    }
  }
}

/** Drops the page's allowances (fig.reset): a redraw states them again. */
export function clearAllowances(page) {
  if (!page?.customData) {
    return
  }
  page.customData = { ...page.customData }
  delete page.customData.asterAllow
  delete page.customData.asterAllowAreas
}
