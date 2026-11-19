// A layout for generation teasers: a row (or rows) of equal panels sized to the page, with the
// type, dot and stroke sizes that keep everything at a minimum print size. Round H's flow
// teasers packed four or five panels at the 7 pt floor with 5 pt scripts and 1 px dots; the
// helper does the arithmetic so labels print at 8 pt and says when the page cannot hold them.
import { warnKit } from './research-figures-cards.mjs'
import { printScale } from './research-figures-lint-panels.mjs'
import { oneOf } from './research-figures-options.mjs'

/** The narrowest panel body (units) a density plus its paths and labels reads in: about 1.1 in. */
export const TEASER_MIN_BODY = 160

/**
 * Sizes (scene units) that print at `minPt` or more on this page: labels, math (a step up, so
 * its scripts stay near 6.3 pt), captions, dots, paths, plus `scale` (how much the page shrinks).
 */
export function teaserSizes(page, minPt = 8) {
  const scale = printScale(page)
  const units = (pt) => Math.ceil((pt * 2) / scale)
  return {
    scale,
    label: units(minPt),
    math: units(minPt + 1),
    caption: units(minPt),
    note: units(Math.max(7, minPt - 1)),
    dot: Math.max(2.5, Math.ceil((1.5 / scale) * 10) / 10),
    path: Math.max(1.25, 1 / scale),
    hero: Math.max(2.5, 2 / scale)
  }
}

/**
 * Splits a panel body into `slots` side by side ([1, 1, 1] or a count): boxes for a source, an
 * intermediate and a target density, each square when the body allows, centred vertically.
 */
export function bodySlots(body, slots, gap = 8) {
  const weights = Array.isArray(slots) ? slots : Array.from({ length: slots }, () => 1)
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  const room = body.w - gap * (weights.length - 1)
  let x = body.x
  return weights.map((weight) => {
    const w = (room * weight) / total
    const h = Math.min(body.h, Math.max(w, body.h * 0.8))
    const box = { x, y: body.y + (body.h - h) / 2, w, h, cx: x + w / 2, cy: body.y + body.h / 2 }
    x += w + gap
    return box
  })
}

export function teaserMethods(core, figOf) {
  return {
    /**
     * Equal panels for a generation teaser, sized to the page: `panels` (captions such as
     * '(a) Data', or a count), `rows`, x, y, w, h (default: the page inside 12-unit margins),
     * `gap`, `captions` 'below' | 'none', `outline` (panel()'s, default true: the quiet line),
     * `color` (panel fill, default 'none'), `minPt` (8). Returns `panels` [{ id, x, y, w, h,
     * body, slots(n) }], `sizes` { label, math, caption, note, dot, path, hero } in units, and
     * warns when a panel's body is narrower than 1.1 in at print.
     */
    teaserGrid(spec) {
      const fig = figOf()
      if (!spec?.id) {
        throw new Error('teaserGrid({ id, panels: [captions] | n }) needs an id')
      }
      const page = core.page()
      const count = Array.isArray(spec.panels) ? spec.panels.length : spec.panels
      if (!Number.isInteger(count) || count < 1 || count > 12) {
        throw new Error('teaserGrid panels is a list of captions or a count from 1 to 12')
      }
      const rows = spec.rows ?? 1
      const cols = Math.ceil(count / rows)
      const sizes = teaserSizes(page, spec.minPt ?? 8)
      const captions = oneOf('captions', spec.captions ?? 'below', ['below', 'none'])
      const margin = 12
      const x0 = spec.x ?? margin
      const y0 = spec.y ?? margin
      const width = spec.w ?? (page ? page.widthIn * 144 - x0 - margin : 948)
      const height = spec.h ?? (page ? page.heightIn * 144 - y0 - margin : 240)
      const gap = spec.gap ?? 12
      const captionRow =
        captions === 'below' && Array.isArray(spec.panels) ? sizes.caption * 1.25 + 6 : 0
      const cellW = (width - gap * (cols - 1)) / cols
      const cellH = (height - gap * (rows - 1)) / rows - captionRow
      const pad = spec.pad ?? 8
      const notes = []
      const bodyIn = ((cellW - 2 * pad) * sizes.scale) / 144
      if (cellW - 2 * pad < TEASER_MIN_BODY / sizes.scale) {
        const fits = Math.max(
          1,
          Math.floor((width + gap) / (TEASER_MIN_BODY / sizes.scale + 2 * pad + gap))
        )
        notes.push(
          `teaserGrid ${spec.id}: ${cols} panels a row leave ${Math.round(bodyIn * 100) / 100} in for each panel's drawing at print, under ${Math.round((TEASER_MIN_BODY / 144) * 100) / 100} in, so densities, paths and labels crowd; put ${fits} a row (rows: ${Math.ceil(count / fits)}), drop a panel, or widen the page`
        )
      }
      const panels = []
      for (let k = 0; k < count; k += 1) {
        const row = Math.floor(k / cols)
        const col = k % cols
        const x = x0 + col * (cellW + gap)
        const y = y0 + row * (cellH + captionRow + gap)
        const id = `${spec.id}-${k}`
        fig.panel({
          id,
          x,
          y,
          w: cellW,
          h: cellH,
          color: spec.color ?? 'none',
          outline: spec.outline ?? true
        })
        const caption = Array.isArray(spec.panels) ? spec.panels[k] : null
        if (caption && captions === 'below') {
          fig.text({
            id: `${id}-caption`,
            text: caption,
            size: sizes.caption,
            cx: x + cellW / 2,
            y: y + cellH + 5
          })
        }
        const body = { x: x + pad, y: y + pad, w: cellW - 2 * pad, h: cellH - 2 * pad }
        panels.push({
          id,
          x,
          y,
          w: cellW,
          h: cellH,
          body,
          slots: (slots, slotGap) => bodySlots(body, slots, slotGap)
        })
      }
      ;(core.warn ?? warnKit)(notes)
      return { id: spec.id, panels, sizes, warnings: notes }
    }
  }
}
