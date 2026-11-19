// Real plots in a diagram panel: `plot` places one rendered plot (a plot figure's vector SVG) at
// its natural size or fitted to a box, `plots` lays several out in a grid with (a)/(b) labels at
// one common scale, and `plotPoint` turns a spot in a plot (a share of a panel, or a data point
// when the plot's manifest gives its limits) into scene coordinates for arrows and labels.
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { warnKit } from './research-figures-cards.mjs'
import { oneOf } from './research-figures-options.mjs'
import {
  PLOT_FILE_PREFIX,
  makePlotImage,
  naturalSize,
  readPlot
} from './research-figures-plot-embed.mjs'
import { anchorPart, labelPart } from './research-figures-science-parts.mjs'

/** Below this the plot's smallest text prints under 6.5 pt (its 7 pt ticks shrink). */
const SMALLEST_PT = 6.5
/** The smallest cell (units) fig.plots lays a plot into: a third of an inch. */
const MIN_CELL = 48

/** `(a)`, `a`, `A`, `(i)`-free label formats for the nth cell, or the given list's entry. */
export function cellLabel(format, index) {
  if (Array.isArray(format)) {
    return format[index] ?? null
  }
  const letter = String.fromCharCode(97 + index)
  return (
    {
      '(a)': `(${letter})`,
      a: letter,
      A: letter.toUpperCase(),
      '(A)': `(${letter.toUpperCase()})`,
      'a)': `${letter})`
    }[format] ?? null
  )
}

/** How a plot is fitted to its box: the largest that fits, its width, its height, or exactly. */
export const PLOT_FITS = ['contain', 'width', 'height', 'exact']

/**
 * How a plot of natural size `natural` fits `spec`: { width, height, scale } in scene units.
 * `fit` 'contain' (default with w and h: the largest that fits), 'width' (w sets the scale),
 * 'height' (h sets it) or 'exact' (fills w × h; the plot must have been made at that shape).
 */
export function fitPlot(natural, spec) {
  for (const key of ['w', 'h', 'scale']) {
    if (
      spec[key] !== undefined &&
      !(typeof spec[key] === 'number' && Number.isFinite(spec[key]) && spec[key] > 0)
    ) {
      throw new Error(
        `plot ${spec.id}: ${key} must be a positive number, not ${JSON.stringify(spec[key])}`
      )
    }
  }
  const fit = oneOf('fit', spec.fit, PLOT_FITS)
  if ((fit === 'width' && spec.w === undefined) || (fit === 'height' && spec.h === undefined)) {
    throw new Error(`plot ${spec.id}: fit '${fit}' needs ${fit === 'width' ? 'w' : 'h'}`)
  }
  if (fit === 'exact' && (spec.w === undefined || spec.h === undefined)) {
    throw new Error(`plot ${spec.id}: fit 'exact' needs both w and h`)
  }
  if (fit === 'exact') {
    const scale = Math.min(spec.w / natural.width, spec.h / natural.height)
    const off = Math.abs(spec.w / spec.h - natural.width / natural.height) / (spec.w / spec.h)
    // Why not stretch: a plot drawn out of shape stretches its text; it must be made at w × h.
    return off <= 0.02
      ? { width: spec.w, height: spec.h, scale: spec.w / natural.width }
      : { width: natural.width * scale, height: natural.height * scale, scale, misfit: off }
  }
  const scale =
    spec.scale ??
    (fit === 'width'
      ? spec.w / natural.width
      : fit === 'height'
        ? spec.h / natural.height
        : spec.w !== undefined && spec.h !== undefined
          ? Math.min(spec.w / natural.width, spec.h / natural.height)
          : spec.w !== undefined
            ? spec.w / natural.width
            : spec.h !== undefined
              ? spec.h / natural.height
              : 1)
  return { width: natural.width * scale, height: natural.height * scale, scale }
}

/** The plot size (inches, 2 decimals) that prints a w × h unit cell at scale 1. */
export const cellInches = (w, h) => [
  Math.round((w / 144) * 100) / 100,
  Math.round((h / 144) * 100) / 100
]

/**
 * Warnings about how a plot prints at `scale` in a `shown` cell (scene units): text too small
 * (with both fixes: a larger cell, or the plot made at the cell's size), or blown up.
 */
export function scaleWarnings(id, info, scale, shown) {
  const warnings = []
  const printed = info.minFontPt === null ? null : info.minFontPt * scale
  if (printed !== null && printed < SMALLEST_PT) {
    const [w, h] = cellInches(
      shown?.width ?? info.widthPt * scale * 2,
      shown?.height ?? info.heightPt * scale * 2
    )
    const grow = SMALLEST_PT / printed
    warnings.push(
      `plot ${id}: its smallest text prints at ${Math.round(printed * 10) / 10} pt (scaled ×${Math.round(scale * 100) / 100}); make the plot at the cell's size (ap.figure(size=(${w}, ${h}), panel=True), or figures plot new --size ${w}x${h}) and place it with fit: 'exact', or make the cell ×${Math.round(grow * 100) / 100} larger`
    )
  }
  if (scale > 1.25) {
    warnings.push(
      `plot ${id}: shown ×${Math.round(scale * 100) / 100} its natural size, so its text and lines print larger than the diagram's; make it at the panel's size instead`
    )
  }
  if (info.liveText) {
    warnings.push(
      `plot ${id}: its SVG keeps ${info.liveText} text elements live, whose fonts are not embedded and print in a fallback font; embed the plot's .embed.svg (text as outlines)`
    )
  }
  return warnings
}

/** The plot's smallest text: the manifest's (the plot layer knows it), else read from the SVG. */
export function plotMinFont(plot) {
  const stated = plot.manifest?.text?.minPt ?? plot.manifest?.minFontPt
  return Number.isFinite(stated) ? stated : plot.info.minFontPt
}

/**
 * Helper plots are named after the drawing they sit in, `<drawing>-<part>`; the drawing's own
 * slug would give both one PDF. Throws for that; warns for a cell plot named otherwise.
 */
export function plotNameWarnings(slug, spec, plot) {
  if (!slug || !spec.figure) {
    return []
  }
  if (spec.figure === slug) {
    throw new Error(
      `plot ${spec.id}: the plot cannot take the drawing's own slug ${slug} (both would write ${slug}.pdf); name it ${slug}-<part>, like ${slug}-flows`
    )
  }
  return plot.manifest?.panel && !spec.figure.startsWith(`${slug}-`)
    ? [
        `plot ${spec.id}: ${spec.figure} was made for a diagram cell; name helper plots ${slug}-<part> (${slug}-${spec.figure.replace(/^.*?-?([a-z0-9]+)$/, '$1')}) so they sort and refresh with the drawing`
      ]
    : []
}

/** A scene point for a spot in a placed plot: see `plotPoint`. */
export function pointInPlot(element, where) {
  const record = element.customData?.asterPlot
  if (!record) {
    throw new Error(`${element.id} is not a plot (fig.plot draws one)`)
  }
  const spec = Array.isArray(where) ? { at: where } : (where ?? {})
  const unitsPerInch = element.width / (record.widthPt / 72)
  let box = { x: 0, y: 0, w: record.widthPt / 72, h: record.heightPt / 72 }
  let panel = null
  if (spec.panel !== undefined) {
    panel = record.panels.find(
      (item) => item.id === String(spec.panel) || item.label === spec.panel
    )
    if (!panel) {
      throw new Error(
        `plot ${element.id} has no panel ${JSON.stringify(spec.panel)}; panels: ${record.panels.map((item) => item.id).join(', ') || 'none (no manifest)'}`
      )
    }
    box = panel.box
  }
  let share = spec.at
  if (spec.data) {
    if (!panel?.xlim || !panel?.ylim) {
      throw new Error(
        `plot ${element.id}: data points need a panel whose manifest gives xlim and ylim; use at: [u, v] (shares of the panel, from its bottom-left)`
      )
    }
    const axis = (value, [lo, hi], scale) =>
      scale === 'log'
        ? (Math.log(value) - Math.log(lo)) / (Math.log(hi) - Math.log(lo))
        : (value - lo) / (hi - lo)
    share = [
      axis(spec.data[0], panel.xlim, panel.xscale),
      axis(spec.data[1], panel.ylim, panel.yscale)
    ]
  }
  if (!Array.isArray(share) || share.length !== 2 || !share.every(Number.isFinite)) {
    throw new Error(
      `plotPoint(${element.id}, …) takes [u, v], { panel, at: [u, v] } or { panel, data: [x, y] }`
    )
  }
  // Why from the bottom-left: shares of an axes read like matplotlib's axes fraction.
  return [
    element.x + (box.x + share[0] * box.w) * unitsPerInch,
    element.y + (box.y + (1 - share[1]) * box.h) * unitsPerInch
  ]
}

export function plotMethods(core, sceneOf) {
  const warn = (list) => (core.warn ?? warnKit)(list)
  /** The drawing's project, folder and slug (helper plots are named after it). */
  const folderOf = () => {
    const { project, target } = sceneOf()
    return { project, folder: path.dirname(target), slug: path.basename(target, '.excalidraw') }
  }
  const load = async (spec) => {
    const { project, folder } = folderOf()
    const plot = await readPlot(project, folder, { figure: spec.figure, svg: spec.svg })
    return { ...plot, info: { ...plot.info, minFontPt: plotMinFont(plot) } }
  }
  /** Places a read plot; returns the image element and its panels in scene units. */
  const describe = (element) => {
    const record = element.customData.asterPlot
    const unitsPerInch = element.width / (record.widthPt / 72)
    return {
      id: element.id,
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      right: element.x + element.width,
      bottom: element.y + element.height,
      scale: element.width / (record.widthPt * 2),
      panels: record.panels.map((panel) => ({
        id: panel.id,
        label: panel.label,
        x: element.x + panel.box.x * unitsPerInch,
        y: element.y + panel.box.y * unitsPerInch,
        width: panel.box.w * unitsPerInch,
        height: panel.box.h * unitsPerInch
      }))
    }
  }
  /**
   * A plot shown in a w × h cell is rendered at that size: the cell goes in `<plot>.cell.json`
   * (every later `figures plot run` keeps it) and the plot runs again, so its text prints at
   * its own size instead of being scaled. Needs panel=True in the plot script.
   */
  const atCell = async (spec, plot) => {
    const natural = naturalSize(plot.info)
    const cellFit = spec.fit === undefined || spec.fit === 'contain' || spec.fit === 'exact'
    if (
      !spec.figure ||
      spec.cell === false ||
      !cellFit ||
      spec.w === undefined ||
      spec.h === undefined ||
      (Math.abs(natural.width - spec.w) <= 3 && Math.abs(natural.height - spec.h) <= 3)
    ) {
      return plot
    }
    const { project, folder } = folderOf()
    const [widthIn, heightIn] = cellInches(spec.w, spec.h).map(Number)
    await writeFile(
      path.join(folder, `${spec.figure}.cell.json`),
      `${JSON.stringify({ widthIn, heightIn, drawing: folderOf().slug })}\n`
    )
    const { runPlot } = await import('./research-figures-plot.mjs')
    const run = await runPlot(project, spec.figure).catch((error) => ({ saved: false, error }))
    if (!run.saved) {
      warn([
        `plot ${spec.id}: could not render ${spec.figure} at its ${widthIn} × ${heightIn} in cell (${run.error?.message ?? run.problem ?? 'the script failed'}); fitted as it is`
      ])
      return plot
    }
    return load(spec)
  }
  const imageFor = (spec, plot, box) => {
    const element = makePlotImage(spec, plot, box)
    core.files.embed(PLOT_FILE_PREFIX, plot.svg)
    return element
  }
  return {
    /**
     * A rendered plot as a vector image: `figure` (a plot slug) or `svg` (a path or markup),
     * at its natural size, `scale`, or fitted to `w` / `h` (both: the largest that fits,
     * centred). Returns its box, scale and panels (scene units).
     */
    async plot(spec) {
      if (!spec?.id) {
        throw new Error('plot({ id, figure | svg, x, y }) needs an id')
      }
      const plot = await atCell(spec, await load(spec))
      const fit = fitPlot(naturalSize(plot.info), spec)
      // Why centred only for contain: width, height and exact are placed at x, y as given.
      const centred =
        (spec.fit ?? 'contain') !== 'width' &&
        (spec.fit ?? 'contain') !== 'height' &&
        spec.w !== undefined &&
        spec.h !== undefined &&
        spec.align !== 'top-left'
      const x = (spec.x ?? 0) + (centred ? (spec.w - fit.width) / 2 : 0)
      const y = (spec.y ?? 0) + (centred ? (spec.h - fit.height) / 2 : 0)
      const cell = { width: spec.w ?? fit.width, height: spec.h ?? fit.height }
      const notes = [...plotNameWarnings(folderOf().slug, spec, plot)]
      if (fit.misfit) {
        const [w, h] = cellInches(spec.w, spec.h)
        notes.push(
          `plot ${spec.id}: fit 'exact' needs the plot made at ${w} × ${h} in (its shape is ${Math.round(fit.misfit * 100)}% off); make it with ap.figure(size=(${w}, ${h}), panel=True), or figures plot new --size ${w}x${h}; until then it is fitted inside`
        )
      }
      if (spec.fit === 'width' && spec.h !== undefined && fit.height > spec.h + 0.5) {
        notes.push(
          `plot ${spec.id}: at w ${spec.w} it is ${Math.round(fit.height)} tall, past h ${spec.h}; give it more height or make it at the cell's shape (fit: 'exact')`
        )
      }
      if (spec.fit === 'height' && spec.w !== undefined && fit.width > spec.w + 0.5) {
        notes.push(
          `plot ${spec.id}: at h ${spec.h} it is ${Math.round(fit.width)} wide, past w ${spec.w}; give it more width or make it at the cell's shape (fit: 'exact')`
        )
      }
      warn([...notes, ...scaleWarnings(spec.id, plot.info, fit.scale, cell)])
      const element = imageFor(spec, plot, { x, y, width: fit.width, height: fit.height })
      core.claim(spec.id, [element])
      core.insert([element])
      return describe(element)
    },
    /**
     * Several plots in one panel: `grid: [rows, cols]`, `items` (each `{ figure | svg, id }`),
     * all at one scale (the largest at which every plot fits its cell, never above natural
     * size unless `grow`), each centred in its cell with its label ('(a)', 'a', 'A' or a list)
     * at the top-left, or under it with `captions`.
     */
    async plots(spec) {
      if (!spec?.id || !Array.isArray(spec.items) || !spec.items.length) {
        throw new Error(
          'plots({ id, x, y, w, grid: [rows, cols], items: [{ figure | svg }] }) needs an id and items'
        )
      }
      const count = spec.items.length
      const [rows, cols] = spec.grid ?? [1, count]
      if (
        !Number.isInteger(rows) ||
        !Number.isInteger(cols) ||
        rows < 1 ||
        cols < 1 ||
        rows * cols < count
      ) {
        throw new Error(`plots ${spec.id}: grid [${rows}, ${cols}] has no room for ${count} items`)
      }
      const [gapX, gapY] = Array.isArray(spec.gap) ? spec.gap : [spec.gap ?? 16, spec.gap ?? 16]
      const style = core.styled({}).style
      const labelSize = spec.labelSize ?? style.textSize ?? 16
      const format = spec.labels ?? '(a)'
      const captions = spec.captions ?? null
      const position = oneOf(
        'labelPosition',
        spec.labelPosition ?? (captions ? 'below' : 'top-left'),
        ['top-left', 'below']
      )
      const plots = await Promise.all(spec.items.map((item) => load(item)))
      const labelled = plots.map((plot, index) =>
        format === false
          ? null
          : plot.manifest?.panels?.some((panel) => panel.label)
            ? null
            : cellLabel(format, index)
      )
      const above = position === 'top-left' && labelled.some(Boolean) ? labelSize * 1.25 + 4 : 0
      const below =
        position === 'below' && (labelled.some(Boolean) || captions) ? labelSize * 1.25 + 6 : 0
      const naturals = plots.map((plot) => naturalSize(plot.info))
      const widest = Math.max(...naturals.map((size) => size.width))
      const cellW = spec.w !== undefined ? (spec.w - gapX * (cols - 1)) / cols : widest
      const cellH =
        spec.h !== undefined ? (spec.h - gapY * (rows - 1)) / rows - above - below : Infinity
      // Why throw: a cell this small scaled every plot to a speck instead of saying so.
      if (cellW < MIN_CELL || cellH < MIN_CELL) {
        const needW = MIN_CELL * cols + gapX * (cols - 1)
        const needH = (MIN_CELL + above + below) * rows + gapY * (rows - 1)
        throw new Error(
          `plots ${spec.id}: ${cellW < MIN_CELL ? `w ${spec.w} leaves ${cols} cells ${Math.round(cellW)} units wide` : `h ${spec.h} leaves ${rows} rows ${Math.round(cellH)} units tall`} after the gaps and labels; give ${cellW < MIN_CELL ? `w ${Math.ceil(needW)}` : `h ${Math.ceil(needH)}`} or more, fewer ${cellW < MIN_CELL ? 'columns' : 'rows'}, or a smaller gap`
        )
      }
      const scale = Math.min(
        ...naturals.map((size) => Math.min(cellW / size.width, cellH / size.height)),
        spec.grow ? Infinity : 1
      )
      const rowHeights = Array.from({ length: rows }, (_, r) =>
        Math.max(
          0,
          ...naturals
            .filter((_, k) => Math.floor(k / cols) === r)
            .map((size) => size.height * scale)
        )
      )
      const elements = []
      const cells = []
      let top = spec.y ?? 0
      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
          const k = r * cols + c
          if (k >= count) {
            break
          }
          const id = spec.items[k].id ?? `${spec.id}-${k}`
          const size = { width: naturals[k].width * scale, height: naturals[k].height * scale }
          const cellX = (spec.x ?? 0) + c * (cellW + gapX)
          const x = cellX + (cellW - size.width) / 2
          const image = imageFor(
            { ...spec.items[k], id, frame: spec.frame, groupIds: spec.groupIds },
            plots[k],
            { x, y: top + above, ...size }
          )
          if (spec.items[k].standIn) {
            image.customData.asterPlot.standIn = true
          }
          elements.push(image)
          const label = labelled[k]
          const caption = captions?.[k]
          if (position === 'top-left' && label) {
            elements.push(
              ...labelPart(
                { id, style, frame: spec.frame },
                'label',
                label,
                { x, y: top },
                { size: labelSize }
              )
            )
          } else if (position === 'below' && (label || caption)) {
            const text = [label, caption].filter(Boolean).join(' ')
            elements.push(
              ...labelPart(
                { id, style, frame: spec.frame },
                'label',
                text,
                { cx: x + size.width / 2, y: top + above + rowHeights[r] + 6 },
                { size: style.smallSize ?? 14 }
              )
            )
          }
          cells.push({ id, x, y: top + above, width: size.width, height: size.height })
          warn(
            scaleWarnings(id, plots[k].info, scale, {
              width: Number.isFinite(cellW) ? cellW : size.width,
              height: Number.isFinite(cellH) ? cellH : size.height
            })
          )
        }
        top += above + rowHeights[r] + below + gapY
      }
      const right = Math.max(...cells.map((cell) => cell.x + cell.width))
      const box = {
        x: Math.min(...cells.map((cell) => cell.x)),
        y: spec.y ?? 0,
        w: 0,
        h: top - gapY - (spec.y ?? 0)
      }
      box.w = right - box.x
      const anchor = anchorPart(
        { id: spec.id, frame: spec.frame, groupIds: spec.groupIds },
        box,
        'plots',
        { items: cells.map((cell) => cell.id) }
      )
      anchor.groupIds = spec.groupIds ?? []
      core.claim(spec.id, [anchor, ...elements])
      core.insert([anchor, ...elements])
      return {
        id: spec.id,
        ids: cells.map((cell) => cell.id),
        cells,
        scale,
        x: box.x,
        y: box.y,
        width: box.w,
        height: box.h
      }
    },
    /**
     * A point in a placed plot, in scene units: `[u, v]` shares of the whole plot, `{ panel,
     * at: [u, v] }` shares of a panel's data area, or `{ panel, data: [x, y] }` a data point
     * (needs the manifest's limits); u, v from the bottom-left, as matplotlib's axes fraction.
     */
    plotPoint: (id, where) => pointInPlot(core.need(id), where),
    /** Re-reads every plot this figure shows (after `figures plot run`), keeping their places. */
    async refreshPlots() {
      const { project, folder } = folderOf()
      const updated = []
      for (const element of core.elements.filter(
        (item) => !item.isDeleted && item.customData?.asterPlot?.figure
      )) {
        const plot = await readPlot(project, folder, {
          figure: element.customData.asterPlot.figure
        })
        if (plot.sha256 !== element.customData.asterPlot.sha256) {
          const replacement = makePlotImage(
            {
              id: element.id,
              figure: element.customData.asterPlot.figure,
              frame: element.frameId,
              groupIds: element.groupIds
            },
            plot,
            {
              x: element.x,
              y: element.y,
              width: element.width,
              height: (element.width * plot.info.heightPt) / plot.info.widthPt
            }
          )
          core.files.embed(PLOT_FILE_PREFIX, plot.svg)
          Object.assign(element, {
            fileId: replacement.fileId,
            height: replacement.height,
            customData: replacement.customData
          })
          updated.push(element.id)
        }
      }
      return updated
    }
  }
}
