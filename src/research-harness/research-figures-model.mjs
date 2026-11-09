// Figures: plain Excalidraw files next to the manuscript, shared by the harness and the app.

/** Scene units per inch: 1 pt is 2 units, so Excalidraw's S/M/L/XL text is 8/10/14/18 pt. */
export const FIGURE_UNITS_PER_INCH = 144
export const FIGURE_UNITS_PER_POINT = FIGURE_UNITS_PER_INCH / 72
export const PAGE_FRAME_ID = 'figure-page'
export const FIGURE_SCENE_EXTENSION = '.excalidraw'

export const FIGURE_SIZES = {
  single: { label: 'Single column', widthIn: 3.25, heightIn: 2 },
  double: { label: 'Double column', widthIn: 6.75, heightIn: 2.5 }
}
/** How tall a double-column figure may be before it takes most of a page (the default fits). */
export const DOUBLE_COLUMN_MAX_HEIGHT_IN = 2.8

/** Element defaults; colours and weights per figure come from its style (figures-style). */
export const PAPER_STYLE = {
  strokeColor: '#1e1e1e',
  backgroundColor: 'transparent',
  fillStyle: 'solid',
  // Why 2: about 1 pt at print; published figures' lines are 1 to 1.25 pt, never hairlines.
  strokeWidth: 2,
  strokeStyle: 'solid',
  roughness: 0,
  opacity: 100,
  // Excalidraw's Liberation Sans: Arial metrics, bundled with the app and embedded in exports.
  fontFamily: 9,
  fontSize: 16
}

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.svg', '.gif', '.webp'])
const EXPORT_EXTENSIONS = ['.svg', '.pdf', '.png']
const ELEMENT_TYPES = new Set([
  'rectangle',
  'ellipse',
  'diamond',
  'arrow',
  'line',
  'text',
  'frame',
  'freedraw',
  'image',
  'magicframe',
  'embeddable',
  'iframe',
  'selection'
])

export function figureSlug(name) {
  const slug = String(name ?? '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '')
  return slug || 'figure'
}

export function isFigureSlug(value) {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(value)
}

function cleanRelative(path) {
  const normalized = String(path).replaceAll('\\', '/').replace(/^\.\//, '')
  if (
    !normalized ||
    normalized.startsWith('/') ||
    /^[A-Za-z]:/.test(normalized) ||
    normalized.split('/').includes('..')
  ) {
    throw new Error(`Not a project-relative path: ${path}`)
  }
  return normalized
}

/** `paper/main.tex` → `paper/figures`; a manuscript at the project root → `figures`. */
export function figuresFolderFor(manuscriptSource) {
  const source = cleanRelative(manuscriptSource)
  const slash = source.lastIndexOf('/')
  return slash === -1 ? 'figures' : `${source.slice(0, slash)}/figures`
}

/** Aster's PNG previews of what the PDF shows (as rendered, at print size, with lint marks). */
export function figurePreviewPaths(recordRoot, slug) {
  const directory = `${cleanRelative(recordRoot)}/cache/figures`
  return {
    directory,
    png: `${directory}/${slug}.png`,
    sidecar: `${directory}/${slug}.json`,
    compare: `${directory}/${slug}.compare.png`,
    overlay: `${directory}/${slug}.overlay.png`,
    print: `${directory}/${slug}.print.png`,
    lint: `${directory}/${slug}.lint.png`
  }
}

/** Where Aster writes a reference's measured colour regions: beside it, kept out of Git too. */
export function referenceRegionsPath(referencePath) {
  return `${cleanRelative(referencePath).replace(/\.[^./]+$/, '')}.regions.json`
}

export function figureFilePaths(folder, slug) {
  const base = `${cleanRelative(folder)}/${slug}`
  return {
    scene: `${base}${FIGURE_SCENE_EXTENSION}`,
    svg: `${base}.svg`,
    pdf: `${base}.pdf`,
    png: `${base}.png`,
    /** The agent's drawing script, committed so the figure can be regenerated. */
    script: `${cleanRelative(folder)}/src/${slug}.figure.mjs`
  }
}

function extensionOf(name) {
  const dot = name.lastIndexOf('.')
  return dot <= 0 ? '' : name.slice(dot).toLowerCase()
}

/**
 * Groups a figures folder: each `<slug>.excalidraw` with its exports, then every other image or
 * PDF (matplotlib output and the like) as a read-only figure.
 */
export function listFigureFolder(entries) {
  const files = entries.filter((entry) => !entry.isDirectory).map((entry) => entry.name)
  const names = new Set(files)
  const figures = files
    .filter((name) => name.endsWith(FIGURE_SCENE_EXTENSION))
    .map((name) => name.slice(0, -FIGURE_SCENE_EXTENSION.length))
    .filter(isFigureSlug)
    .sort()
    .map((slug) => ({
      slug,
      svg: names.has(`${slug}.svg`),
      pdf: names.has(`${slug}.pdf`),
      png: names.has(`${slug}.png`)
    }))
  const exportNames = new Set(
    figures.flatMap((figure) => EXPORT_EXTENSIONS.map((extension) => `${figure.slug}${extension}`))
  )
  const others = files
    .filter((name) => !exportNames.has(name) && !name.startsWith('.'))
    .filter((name) => IMAGE_EXTENSIONS.has(extensionOf(name)) || extensionOf(name) === '.pdf')
    .sort()
    .map((name) => ({ name, kind: extensionOf(name) === '.pdf' ? 'pdf' : 'image' }))
  return { figures, others }
}

function randomId(random) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let id = ''
  for (let index = 0; index < 20; index += 1) {
    id += alphabet[Math.floor(random() * alphabet.length)]
  }
  return id
}

function randomInteger(random) {
  return Math.floor(random() * 2 ** 31)
}

/** A complete Excalidraw element with the paper style; `props` override any field. */
export function figureElement(type, props = {}, random = Math.random) {
  return {
    id: randomId(random),
    type,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    angle: 0,
    strokeColor: PAPER_STYLE.strokeColor,
    backgroundColor: PAPER_STYLE.backgroundColor,
    fillStyle: PAPER_STYLE.fillStyle,
    strokeWidth: PAPER_STYLE.strokeWidth,
    strokeStyle: PAPER_STYLE.strokeStyle,
    roughness: PAPER_STYLE.roughness,
    opacity: PAPER_STYLE.opacity,
    groupIds: [],
    frameId: null,
    roundness: null,
    seed: randomInteger(random),
    version: 1,
    versionNonce: randomInteger(random),
    isDeleted: false,
    boundElements: null,
    updated: 1,
    link: null,
    locked: false,
    ...(type === 'text'
      ? {
          text: '',
          originalText: '',
          fontSize: PAPER_STYLE.fontSize,
          fontFamily: PAPER_STYLE.fontFamily,
          textAlign: 'center',
          verticalAlign: 'middle',
          containerId: null,
          autoResize: true,
          lineHeight: 1.25
        }
      : {}),
    ...(type === 'arrow' || type === 'line'
      ? {
          points: [
            [0, 0],
            [0, 0]
          ],
          lastCommittedPoint: null,
          startBinding: null,
          endBinding: null,
          startArrowhead: null,
          endArrowhead: type === 'arrow' ? 'triangle' : null,
          elbowed: false
        }
      : {}),
    ...(type === 'frame' ? { name: null } : {}),
    ...props
  }
}

export function figureSizeLabel(widthIn, heightIn) {
  return `${widthIn} × ${heightIn} in`
}

/** The locked frame that marks the printed figure; exports crop to it. */
export function pageFrameElement(widthIn, heightIn, random = Math.random, style = null) {
  return figureElement(
    'frame',
    {
      id: PAGE_FRAME_ID,
      width: Math.round(widthIn * FIGURE_UNITS_PER_INCH),
      height: Math.round(heightIn * FIGURE_UNITS_PER_INCH),
      name: `Figure · ${figureSizeLabel(widthIn, heightIn)}`,
      locked: true,
      customData: { asterPage: { widthIn, heightIn, ...(style ? { style } : {}) } }
    },
    random
  )
}

export function newFigureScene(size, random = Math.random, style = null) {
  return {
    type: 'excalidraw',
    version: 2,
    source: 'aster',
    elements: size ? [pageFrameElement(size.widthIn, size.heightIn, random, style)] : [],
    appState: { gridSize: 20, gridStep: 5, gridModeEnabled: true, viewBackgroundColor: '#ffffff' },
    files: {}
  }
}

function liveElements(elements) {
  return Array.isArray(elements)
    ? elements.filter((element) => element && typeof element === 'object' && !element.isDeleted)
    : []
}

function boundsOf(element) {
  return { x: element.x, y: element.y, width: element.width, height: element.height }
}

/** The printed page, from the frame Aster drew; null for a figure without one. */
export function figurePage(elements) {
  const frame = liveElements(elements).find(
    (element) =>
      element.type === 'frame' &&
      (element.id === PAGE_FRAME_ID || element.customData?.asterPage !== undefined)
  )
  if (!frame) {
    return null
  }
  const page = frame.customData?.asterPage
  const widthIn = Number(page?.widthIn) || frame.width / FIGURE_UNITS_PER_INCH
  const heightIn = Number(page?.heightIn) || frame.height / FIGURE_UNITS_PER_INCH
  const reference = typeof page?.reference === 'string' ? page.reference : null
  const style = typeof page?.style === 'string' ? page.style : null
  const accent = typeof page?.accent === 'string' ? page.accent : null
  const panels = Array.isArray(page?.panels)
    ? page.panels.filter((name) => typeof name === 'string')
    : null
  // Why both: the kit records the preset the agent picked, so a style the person set since
  // (the page's style no longer matching it) reads as their choice.
  const agentStyle = typeof page?.agentStyle === 'string' ? page.agentStyle : null
  const styleBy = !style ? null : style === agentStyle ? 'agent' : 'person'
  // Why the same way: the kit and `figures new` record the size the agent picked, so a page
  // sized in Aster (by the person, or Aster's default) is not the agent's to change.
  const agentSize = page?.agentSize
  const sizeBy =
    agentSize && agentSize.widthIn === widthIn && agentSize.heightIn === heightIn
      ? 'agent'
      : 'person'
  return {
    id: frame.id,
    widthIn,
    heightIn,
    reference,
    style,
    accent,
    panels,
    styleBy,
    sizeBy,
    ...boundsOf(frame)
  }
}

/** Frames made by Generate in area: their id, bounds, request, and child count. */
export function figureAreas(elements) {
  const live = liveElements(elements)
  return live
    .filter((element) => element.type === 'frame' && element.customData?.asterArea)
    .map((frame) => ({
      id: frame.id,
      name: frame.name ?? '',
      prompt: String(frame.customData.asterArea.prompt ?? ''),
      ...boundsOf(frame),
      children: live.filter((element) => element.frameId === frame.id).length
    }))
}

/** What a person would call an element: its text, its container's text, or its frame name. */
export function elementLabel(element, elements) {
  if (element.type === 'text') {
    return String(element.text ?? '')
  }
  if (element.type === 'frame') {
    return String(element.name ?? '')
  }
  const bound = (element.boundElements ?? []).find((entry) => entry?.type === 'text')
  const text = bound ? elements.find((candidate) => candidate.id === bound.id) : null
  return text ? String(text.text ?? '') : ''
}

/** Elements whose box meets `area`, without the page frame and `area` itself, for prompts. */
export function elementsTouching(elements, area) {
  const live = liveElements(elements)
  const right = area.x + area.width
  const bottom = area.y + area.height
  return live
    .filter((element) => element.id !== area.id && element.id !== PAGE_FRAME_ID)
    .filter((element) => {
      const left = Math.min(element.x, element.x + element.width)
      const top = Math.min(element.y, element.y + element.height)
      const width = Math.abs(element.width)
      const height = Math.abs(element.height)
      return left <= right && left + width >= area.x && top <= bottom && top + height >= area.y
    })
    .map((element) => ({
      id: element.id,
      type: element.type,
      label: elementLabel(element, live).replace(/\s+/g, ' ').trim().slice(0, 80),
      frameId: element.frameId ?? null
    }))
}

/** A frame name for an area: the request's first words. */
export function shortAreaName(prompt) {
  const flat = String(prompt).replace(/\s+/g, ' ').trim()
  return flat.length > 40 ? `${flat.slice(0, 39).trimEnd()}…` : flat || 'Area'
}

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * Why an element cannot be drawn: a coordinate, size or point given but not a number (a script's
 * NaN is written as null). A missing field is a malformed file, which checkFigureScene reports.
 */
function brokenGeometry(element) {
  const broken = (key) => key in element && !finite(element[key])
  const bad = ['x', 'y', 'width', 'height', 'angle', 'fontSize'].filter(broken)
  const points = element.points
  if (
    Array.isArray(points) &&
    !points.every((point) => Array.isArray(point) && finite(point[0]) && finite(point[1]))
  ) {
    bad.push('points')
  }
  return bad
}

/**
 * Drops the elements whose geometry is not numbers (a script's NaN is written as null), and
 * what pointed at them, so the rest of the figure still opens; `repairs` says what went.
 */
export function repairFigureScene(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.elements)) {
    return { scene: value, repairs: [] }
  }
  const repairs = []
  const dropped = new Set()
  for (const element of value.elements) {
    if (element && typeof element === 'object' && !element.isDeleted) {
      const bad = brokenGeometry(element)
      if (bad.length) {
        dropped.add(element.id)
        repairs.push(`Dropped ${element.id ?? 'an element'}: ${bad.join(', ')} not a number`)
      }
    }
  }
  if (!dropped.size) {
    return { scene: value, repairs }
  }
  const elements = value.elements
    .filter((element) => !dropped.has(element?.id))
    .map((element) => {
      const next = { ...element }
      for (const side of ['startBinding', 'endBinding']) {
        if (dropped.has(next[side]?.elementId)) {
          next[side] = null
        }
      }
      for (const key of ['containerId', 'frameId']) {
        if (dropped.has(next[key])) {
          next[key] = null
        }
      }
      if (Array.isArray(next.boundElements)) {
        next.boundElements = next.boundElements.filter((bound) => !dropped.has(bound?.id))
      }
      return next
    })
  return { scene: { ...value, elements }, repairs }
}

function checkElement(element, index, ids) {
  const where = `elements[${index}]${typeof element?.id === 'string' ? ` (${element.id})` : ''}`
  if (!element || typeof element !== 'object') {
    return [`${where} is not an object`]
  }
  const issues = []
  if (typeof element.id !== 'string' || !element.id) {
    issues.push(`${where}: id must be a non-empty string`)
  }
  if (!ELEMENT_TYPES.has(element.type)) {
    issues.push(`${where}: unknown type ${JSON.stringify(element.type)}`)
  }
  for (const key of ['x', 'y', 'width', 'height']) {
    if (!finite(element[key])) {
      issues.push(`${where}: ${key} must be a number`)
    }
  }
  const linear = ['arrow', 'line', 'freedraw'].includes(element.type)
  if (!linear && element.width === 0 && element.height === 0) {
    issues.push(`${where}: width and height are both 0, so Excalidraw drops it`)
  }
  if (element.frameId != null && !ids.frames.has(element.frameId)) {
    issues.push(`${where}: frameId ${element.frameId} is not a frame in this figure`)
  }
  if (element.type === 'text') {
    if (typeof element.text !== 'string') {
      issues.push(`${where}: text elements need "text"`)
    }
    if (!finite(element.fontSize)) {
      issues.push(`${where}: text elements need a numeric fontSize`)
    }
    if (element.containerId != null && !ids.all.has(element.containerId)) {
      issues.push(`${where}: containerId ${element.containerId} does not exist`)
    }
  }
  if (element.type === 'arrow' || element.type === 'line') {
    const points = element.points
    if (
      !Array.isArray(points) ||
      points.length < 2 ||
      !points.every((point) => Array.isArray(point) && finite(point[0]) && finite(point[1]))
    ) {
      issues.push(`${where}: ${element.type} needs at least two [x, y] points`)
    }
    for (const side of ['startBinding', 'endBinding']) {
      const target = element[side]?.elementId
      if (target !== undefined && !ids.all.has(target)) {
        issues.push(`${where}: ${side} points at missing element ${target}`)
      }
    }
  }
  for (const bound of element.boundElements ?? []) {
    if (bound && typeof bound.id === 'string' && !ids.all.has(bound.id)) {
      issues.push(`${where}: boundElements lists missing element ${bound.id}`)
    }
  }
  return issues
}

/** Problems an agent-written scene has; an empty list means the app can open it. */
export function checkFigureScene(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return ['The file is not a JSON object']
  }
  if (value.type !== 'excalidraw') {
    return ['"type" must be "excalidraw"']
  }
  if (!Array.isArray(value.elements)) {
    return ['"elements" must be an array']
  }
  const live = liveElements(value.elements)
  const issues = []
  const seen = new Set()
  for (const element of value.elements) {
    if (typeof element?.id === 'string') {
      if (seen.has(element.id)) {
        issues.push(`Duplicate element id ${element.id}`)
      }
      seen.add(element.id)
    }
  }
  const ids = {
    all: new Set(live.map((element) => element.id)),
    frames: new Set(live.filter((element) => element.type === 'frame').map((element) => element.id))
  }
  value.elements.forEach((element, index) => {
    if (!element?.isDeleted) {
      issues.push(...checkElement(element, index, ids))
    }
  })
  return issues
}

/**
 * `\begin{figure}` for a figure exported next to the manuscript. `figures/<slug>.pdf` is relative
 * to the manuscript's folder, where LaTeX resolves it; natural size keeps text at its printed pt.
 */
export function figureLatexSnippet({ slug, widthIn, caption }) {
  const wide = typeof widthIn === 'number' && widthIn > 3.5
  const environment = wide ? 'figure*' : 'figure'
  return [
    `\\begin{${environment}}[t]`,
    '  \\centering',
    `  \\includegraphics{figures/${slug}.pdf}`,
    `  \\caption{${caption || 'TODO: caption.'}}`,
    `  \\label{fig:${slug}}`,
    `\\end{${environment}}`
  ].join('\n')
}
