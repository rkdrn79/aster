// Lint for plots placed in a diagram and for the science glyphs: a plot stretched out of shape,
// shrunk until its text is unreadable or blown up past the diagram's type, with live text or
// raster parts, plots side by side at different text sizes, a plot in other colours than the
// page; and densities, clouds, fields and meshes too busy, too fine or too many hues to print.
import { WORLD_PRESETS } from './research-figures-palette-worlds.mjs'
import { colorHue } from './research-figures-style.mjs'

const SMALLEST_PT = 6.5
const round = (value) => Math.round(value * 10) / 10
const inches = (units) => Math.round((units / 144) * 100) / 100

/** A plot image's scale against its natural size (1 pt = 2 units). */
const plotScale = (element) => element.width / (element.customData.asterPlot.widthPt * 2)

function plotChecks(plots, page, add, scale) {
  for (const element of plots) {
    const record = element.customData.asterPlot
    const natural = record.widthPt / record.heightPt
    const shown = element.width / element.height
    if (Math.abs(shown - natural) / natural > 0.02) {
      add(
        'error',
        'plot-distorted',
        element,
        `is drawn ${round(shown * 100) / 100}:1 but the plot is ${round(natural * 100) / 100}:1, which stretches its text and marks; give it only w or h (fig.plot keeps the shape)`
      )
    }
    const factor = plotScale(element) * scale
    if (record.minFontPt && record.minFontPt * factor < SMALLEST_PT) {
      add(
        'warning',
        'plot-small-text',
        element,
        `its smallest text prints at ${round(record.minFontPt * factor)} pt (the plot shown ×${round(factor * 100) / 100}); make the plot at the size it is shown (ap.figure(size=(${inches(element.width)}, ${inches(element.height)}), panel=True)) and place it with fit: 'exact', or make its cell ×${round((SMALLEST_PT / (record.minFontPt * factor)) * 100) / 100} larger`
      )
    }
    if (factor > 1.25) {
      add(
        'warning',
        'plot-scale',
        element,
        `is shown ×${round(factor * 100) / 100} its natural size, so its text and lines print larger than the diagram's; make it at the panel's size`
      )
    }
    if (record.standIn) {
      add(
        'warning',
        'plot-stand-in',
        element,
        'is a stand-in plot; make the real one (figures plot new, figures plot run) and place it with fig.plot or the template’s plots'
      )
    }
    if (record.liveText) {
      add(
        'warning',
        'plot-live-text',
        element,
        `its SVG has ${record.liveText} live text elements whose fonts are not embedded; embed the plot's .embed.svg (text as outlines)`
      )
    }
    if (record.rasters) {
      add(
        'warning',
        'plot-raster',
        element,
        `its SVG carries ${record.rasters} raster image${record.rasters > 1 ? 's' : ''}; keep lines, marks and text vector (rasterize only a dense image such as imshow)`
      )
    }
    const style = record.style
    if (
      style &&
      page &&
      ((style.preset && page.style && style.preset !== page.style) ||
        (style.accent && page.accent && style.accent !== page.accent))
    ) {
      add(
        'warning',
        'plot-style',
        element,
        `the plot was made in ${style.preset ?? '?'}/${style.accent ?? '?'} but the page is ${page.style ?? 'graphite'}/${page.accent ?? '?'}; render it with the page's preset and accent so the colours mean the same`
      )
    }
  }
  // Why one owner: plots laid out together (fig.plots) or side by side should read at one size.
  const groups = new Map()
  for (const element of plots) {
    const record = element.customData.asterPlot
    if (!record.minFontPt) {
      continue
    }
    const key = element.customData.asterKit ?? element.id
    groups.set(key, [
      ...(groups.get(key) ?? []),
      { element, pt: record.minFontPt * plotScale(element) * scale }
    ])
  }
  for (const members of groups.values()) {
    const sizes = members.map((member) => member.pt)
    if (members.length > 1 && Math.max(...sizes) - Math.min(...sizes) > 1) {
      add(
        'warning',
        'plot-scale-mismatch',
        members[0].element,
        `plots placed together print their smallest text from ${round(Math.min(...sizes))} to ${round(Math.max(...sizes))} pt; make them at one size so their text matches`
      )
    }
  }
}

/** How many hue families (hues within 24° of a neighbour join one) a set of hues spans. */
export function hueFamilies(hues) {
  const sorted = [...new Set(hues)].sort((a, b) => a - b)
  if (sorted.length < 2) {
    return sorted.length
  }
  const gaps = sorted.map((hue, index) =>
    index ? hue - sorted[index - 1] : hue + 360 - sorted.at(-1)
  )
  return Math.max(1, gaps.filter((gap) => gap > 24).length)
}

const PART = {
  dot: (element) => element.type === 'ellipse',
  face: (element) => element.type === 'line' && /-f\d+-\d+$/.test(element.id),
  arrow: (element) => element.type === 'line' && /-a\d+-\d+$/.test(element.id)
}

function glyphChecks(elements, anchors, add, scale, page) {
  const byOwner = new Map()
  for (const element of elements) {
    const owner = element.customData?.asterKit
    if (owner && anchors.has(owner) && element.id !== owner) {
      byOwner.set(owner, [...(byOwner.get(owner) ?? []), element])
    }
  }
  const hues = new Map()
  for (const [owner, parts] of byOwner) {
    const anchor = anchors.get(owner)
    const kind = anchor.customData.asterScience.kind
    if (parts.length > 450) {
      add(
        'warning',
        'science-clutter',
        anchor,
        `${kind} ${owner} draws ${parts.length} shapes; fewer samples, paths or a coarser grid print cleaner and keep the figure light`
      )
    }
    const dots = parts.filter(PART.dot)
    const smallest = Math.min(Infinity, ...dots.map((dot) => dot.width))
    if (
      [
        'samples',
        'flowPaths',
        'snapshots',
        'manifold',
        'scene3d',
        'snapshots3d',
        'spacetime'
      ].includes(kind) &&
      smallest * scale < 2.4
    ) {
      add(
        'warning',
        'science-small-marks',
        anchor,
        `${kind} ${owner} has dots ${round(smallest * scale)} units across (${round((smallest * scale) / 2)} pt), which vanish at print; use r of 1.5 or more`
      )
    }
    const faces = parts.filter(PART.face)
    if (faces.length) {
      const side =
        faces.reduce((sum, face) => sum + Math.sqrt(Math.max(1, face.width * face.height)), 0) /
        faces.length
      if (side * scale < 5) {
        add(
          'warning',
          'science-dense-mesh',
          anchor,
          `${kind} ${owner} has mesh cells about ${round(side * scale)} units across, so its lines merge into gray at print; lower grid`
        )
      }
    }
    const arrows = parts.filter(PART.arrow)
    const shortest = Math.min(
      Infinity,
      ...arrows.map((arrow) => Math.hypot(arrow.width, arrow.height))
    )
    if (arrows.length && shortest * scale < 4) {
      add(
        'warning',
        'science-short-arrows',
        anchor,
        `field ${owner} has arrows ${round(shortest * scale)} units long, too short to read their direction; a coarser grid or magnitude: 'equal'`
      )
    }
    const rings = new Set(
      parts.map((part) => part.customData?.asterRing?.mass).filter((mass) => mass !== undefined)
    )
    const frameWidth = anchor.customData.asterScience.frameWidth
    if (kind === 'spacetime' && frameWidth * scale < 16) {
      add(
        'warning',
        'science-thin-frames',
        anchor,
        `spacetime ${owner} shows its frames ${round(frameWidth * scale)} units wide, edge-on enough to read as lines; turn it (azimuth, projection: 'front') or use fewer frames`
      )
    }
    if (rings.size > 6) {
      add(
        'warning',
        'science-rings',
        anchor,
        `${kind} ${owner} draws ${rings.size} contour levels; up to six read at print (levels: 5)`
      )
    }
    for (const part of parts) {
      for (const color of [part.strokeColor, part.backgroundColor]) {
        const hue = color && color !== 'transparent' ? colorHue(color) : null
        if (hue !== null) {
          hues.set(Math.round(hue), owner)
        }
      }
    }
  }
  const families = hueFamilies([...hues.keys()])
  // Why more in a world: there the input, the output and ours each have a hue of their own.
  const world = Boolean(WORLD_PRESETS[page?.style])
  if (families > (world ? 3 : 2)) {
    const first = anchors.get([...hues.values()][0])
    add(
      'warning',
      'science-hues',
      first,
      world
        ? `the distributions and paths use ${families} hues; give the input or prior (d), the output (b) and ours (a) one hue each, the one compared baseline d, other baselines gray`
        : `the distributions and paths use ${families} hues; keep the data or the method in the accent and priors, baselines and noise in gray`
    )
  }
}

/** Plot and science-glyph findings for the elements in scope. */
export function scienceChecks(elements, page, add, scale = 1) {
  const plots = elements.filter(
    (element) => element.type === 'image' && element.customData?.asterPlot?.widthPt
  )
  plotChecks(plots, page, add, scale)
  const anchors = new Map(
    elements
      .filter(
        (element) =>
          element.customData?.asterScience?.kind && element.customData.asterScience.kind !== 'plots'
      )
      .map((element) => [element.id, element])
  )
  if (anchors.size) {
    glyphChecks(elements, anchors, add, scale, page)
  }
}
