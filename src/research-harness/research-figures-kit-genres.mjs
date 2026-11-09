// The kit's pieces for figures beyond method diagrams. Data pipelines (stage cards with an icon,
// a count bar and thumbnails: research-figures-kit-pipeline.mjs) and a funnel of shrinking
// counts. Motivation and teasers: checks and crosses drawn as lines, a mini chart, braces,
// numbered steps, "(a) …" sub-captions. Qualitative examples: text cards with highlighted
// spans, an input → output grid.
import { makeText } from './research-figures-draw.mjs'
import { PAGE_FRAME_ID, figureElement } from './research-figures-model.mjs'
import { elementBounds } from './research-figures-geometry.mjs'
import { labelLines, makeLines } from './research-figures-type.mjs'
import { measureText } from './research-figures-text.mjs'
import { makeBrace, makeChart, makeMark, makeStep } from './research-figures-annotate.mjs'
import { makeCard, makeFunnel, warnKit } from './research-figures-cards.mjs'
import { pictureSpec, pipelineMethods } from './research-figures-kit-pipeline.mjs'
import { wrapLabel } from './research-figures-wrap.mjs'

function union(boxes) {
  const x = Math.min(...boxes.map((box) => box.x))
  const y = Math.min(...boxes.map((box) => box.y))
  const right = Math.max(...boxes.map((box) => box.right ?? box.x + box.width))
  const bottom = Math.max(...boxes.map((box) => box.bottom ?? box.y + box.height))
  return { x, y, width: right - x, height: bottom - y, right, bottom }
}

export function genreMethods(core, figure) {
  const { styled } = core
  const styleNow = () => styled({}).style
  const place = (id, elements) => {
    core.claim(id, elements)
    core.insert(elements)
    return elements
  }
  /** The box of `spec`: x, y, w, h given, or the bounds of the ids in `around`. */
  const boxOf = (spec) =>
    spec.around
      ? union([spec.around].flat().map((id) => core.bounds(id)))
      : {
          x: spec.x ?? 0,
          y: spec.y ?? 0,
          width: spec.w ?? 0,
          height: spec.h ?? 0,
          right: (spec.x ?? 0) + (spec.w ?? 0),
          bottom: (spec.y ?? 0) + (spec.h ?? 0)
        }
  const methods = {
    /**
     * A check or a cross drawn as lines (green, red, or `color`): right and wrong answers,
     * failure cases. `on: id` puts it on that item's top-right corner with a white disc.
     */
    mark(spec) {
      let where = { cx: spec.cx, cy: spec.cy }
      if (spec.on) {
        const box = core.bounds(spec.on)
        const size = spec.size ?? 16
        where = { cx: box.right - size * 0.7, cy: box.y + size * 0.7 }
      }
      return place(
        spec.id,
        makeMark(styled({ ...spec, ...where, disc: spec.disc ?? Boolean(spec.on) }))
      )
    },
    /** A mini chart (bar, line or scatter) with minimal axes; returns its plot box. */
    chart(spec) {
      const result = makeChart(styled(spec))
      place(spec.id, result.elements)
      return result
    },
    /** A brace along a side of items (`around`) or a box, with a label at its tip. */
    brace(spec) {
      return place(spec.id, makeBrace(styled(spec), boxOf(spec)))
    },
    /** A numbered step: a digit in a ring (or `solid` disc), on a stage or an arrow. */
    step(spec) {
      return place(spec.id, makeStep(styled(spec)))[0]
    },
    /**
     * "(a) Prior work" centred under a panel or items (`under`), or at x, y / cx: the
     * sub-caption of side-by-side panels. `text` takes runs ('ours: ', { tex: 'x_t' }).
     */
    subcaption(spec) {
      /** How far a caption under `box` may reach past each side: into the gap to a neighbour. */
      const overhang = (around, size) => {
        const band = [around.y, around.bottom + 2 * size]
        const page = core.elements.find((element) => element.id === PAGE_FRAME_ID)
        let free = page ? Math.min(around.x - page.x, page.x + page.width - around.right) : 0
        for (const element of core.elements) {
          if (element.isDeleted || element.type === 'frame' || element.id === spec.under) {
            continue
          }
          const other = elementBounds(element)
          if (other.bottom < band[0] || other.y > band[1]) {
            continue
          }
          if (other.right <= around.x) {
            free = Math.min(free, around.x - other.right)
          } else if (other.x >= around.right) {
            free = Math.min(free, other.x - around.right)
          }
        }
        return Math.max(0, free - 4)
      }
      const style = styleNow()
      const size = spec.size ?? style.smallSize
      const parts = [spec.text ?? []].flat()
      // Why joined: "(a) prior work" is one text run, so it edits as one line.
      const runs =
        spec.label && typeof parts[0] === 'string'
          ? [`${spec.label} ${parts[0]}`, ...parts.slice(1)]
          : [...(spec.label ? [`${spec.label} `] : []), ...parts]
      const box = spec.under ? core.bounds(spec.under) : null
      // Why wrap: a sub-caption wider than its panel and the gaps beside it runs into the next
      // panel's; one that only reaches into those gaps stays on one line.
      const wrapped = box
        ? wrapLabel(runs, spec.w ?? box.width + 2 * overhang(box, size), size, style)
        : null
      if (wrapped?.overflow) {
        warnKit([
          `subcaption ${spec.id}: a word is wider than ${spec.under} (${Math.round(box.width)}); shorten it or set w`
        ])
      }
      const lines = labelLines(wrapped ? wrapped.label : runs, size, undefined, style)
      const where = box
        ? { cx: spec.cx ?? box.x + box.width / 2, y: box.bottom + (spec.gap ?? 6) }
        : { x: spec.x, cx: spec.cx, y: spec.y }
      return place(
        spec.id,
        makeLines(
          styled({ id: spec.id, size, color: spec.color, frame: spec.frame, ...where }),
          lines
        ).elements
      )
    },
    /** A text example on a card: wrapped text, highlighted spans, a role line and a mark. */
    card(spec) {
      const result = makeCard(styled(spec))
      place(spec.id, result.elements)
      warnKit(result.warnings)
      return result
    },
    /** Shrinking bars with counts above and stage names below: a filtering funnel. */
    funnel(spec) {
      const result = makeFunnel(styled(spec))
      place(spec.id, result.elements)
      return result
    },
    /**
     * Qualitative examples in a grid: `columns` headers ('Input', 'Baseline', 'Ours') over
     * `rows` of cells, each a photo ('cat', { src }, { kind, noise }), a text card ({ text,
     * role, highlights }) or plain text; any cell may carry `mark: 'check' | 'cross'`.
     * `arrows: true` joins the input column to the first output. Returns the cell ids.
     */
    async examples(spec) {
      const style = styleNow()
      const { id, x = 0, y = 0 } = spec
      const cellW = spec.w ?? 96
      const cellH = spec.h ?? 72
      const gap = spec.gap ?? 8
      const size = spec.size ?? style.smallSize
      const rows = spec.rows ?? []
      const columns = spec.columns ?? []
      const rowLabels = spec.rowLabels ?? []
      const labelW = rowLabels.length
        ? Math.max(
            ...rowLabels.map((label) => measureText(String(label), size, style.fontFamily).width)
          ) + 8
        : 0
      const colGap = (index) => (spec.arrows && index === 1 ? Math.max(gap, 32) : gap)
      const colX = []
      let left = x + labelW
      for (
        let index = 0;
        index < Math.max(columns.length, ...rows.map((row) => row.length));
        index += 1
      ) {
        left += index ? colGap(index) : 0
        colX.push(left)
        left += cellW
      }
      const headH = columns.length ? size * 1.25 + 6 : 0
      const headers = columns.map(
        (title, index) =>
          makeText(
            styled({
              id: `${id}-c${index}`,
              text: String(title),
              cx: colX[index] + cellW / 2,
              y,
              size,
              color: spec.highlightColumn === index ? 'accent-ink' : undefined,
              frame: spec.frame
            })
          )[0]
      )
      place(id, [
        figureElement('rectangle', {
          id,
          x,
          y,
          width: left - x,
          height: headH,
          strokeColor: 'transparent',
          backgroundColor: 'transparent',
          frameId: spec.frame ?? null,
          customData: { asterGlyph: 'examples' }
        }),
        ...headers
      ])
      const ids = []
      let top = y + headH
      for (const [r, row] of rows.entries()) {
        const rowIds = []
        let rowH = cellH
        for (const [c, raw] of row.entries()) {
          const cell = typeof raw === 'string' && !/^[a-z]+$/.test(raw) ? { text: raw } : raw
          const cellId = `${id}-r${r}c${c}`
          if (cell === null || cell === undefined) {
            rowIds.push(null)
            continue
          }
          if (cell.text !== undefined) {
            const result = methods.card({
              intentional: true,
              ...cell,
              id: cellId,
              x: colX[c],
              y: top,
              w: cellW,
              h: cell.h ?? cellH,
              size: cell.size ?? size,
              frame: spec.frame
            })
            rowH = Math.max(rowH, result.height)
          } else {
            await figure().image({
              ...pictureSpec(cell),
              mark: undefined,
              id: cellId,
              x: colX[c],
              y: top,
              w: cellW,
              h: cellH,
              frame: spec.frame
            })
            if (cell.mark) {
              methods.mark({ id: `${cellId}-mark`, kind: cell.mark, on: cellId, size: 14 })
            }
          }
          rowIds.push(cellId)
        }
        if (rowLabels[r] !== undefined) {
          place(`${id}-row${r}`, [
            makeText(
              styled({
                id: `${id}-row${r}`,
                text: String(rowLabels[r]),
                x: colX[0] - 8,
                align: 'right',
                cy: top + rowH / 2,
                size,
                frame: spec.frame
              })
            )[0]
          ])
        }
        if (spec.arrows && rowIds[0] && rowIds[1]) {
          figure().arrow({ id: `${id}-r${r}a`, from: rowIds[0], to: rowIds[1], frame: spec.frame })
        }
        ids.push(rowIds)
        top += rowH + gap
      }
      return { ids, width: left - x, height: top - gap - y }
    }
  }
  Object.assign(methods, pipelineMethods(core, figure))
  return methods
}
