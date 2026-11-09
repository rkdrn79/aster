import {
  checkFigureScene,
  repairFigureScene,
  type FigureElement
} from '../../../../research-harness/research-figures-model.mjs'

export type FigureFileState = {
  /** The file's text as last read or written by this page. */
  text: string
  signature: string
}

/** What to do when the file's signature moved: nothing, take the disk version, or ask. */
export type ExternalFigureChange =
  | { kind: 'unchanged' }
  | { kind: 'reload'; text: string }
  | { kind: 'conflict'; text: string }
  | { kind: 'invalid'; text: string; issues: string[] }

/**
 * An agent's write replaces the canvas only when the user has nothing unsaved; otherwise the page
 * asks. A half-written or invalid file is reported and leaves both sides alone.
 */
export function decideExternalChange(input: {
  base: string
  disk: string
  dirty: boolean
}): ExternalFigureChange {
  if (input.disk === input.base) {
    return { kind: 'unchanged' }
  }
  const parsed = parseFigureText(input.disk)
  if (parsed.issues.length) {
    return { kind: 'invalid', text: input.disk, issues: parsed.issues }
  }
  return input.dirty ? { kind: 'conflict', text: input.disk } : { kind: 'reload', text: input.disk }
}

export type ParsedFigure = {
  elements: FigureElement[]
  appState: Record<string, unknown>
  files: Record<string, unknown>
  issues: string[]
  /** Elements left out because their geometry was not numbers; the rest still opens. */
  repairs: string[]
}

export function parseFigureText(text: string): ParsedFigure {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    return {
      elements: [],
      appState: {},
      files: {},
      issues: [`Not valid JSON yet: ${error instanceof Error ? error.message : String(error)}`],
      repairs: []
    }
  }
  // Why repair first: one element with a NaN coordinate must not keep the whole figure closed.
  const { scene: value, repairs } = repairFigureScene(parsed)
  const issues = checkFigureScene(value)
  if (issues.length || !value || typeof value !== 'object') {
    return { elements: [], appState: {}, files: {}, issues, repairs }
  }
  const elements: unknown = Reflect.get(value, 'elements')
  const appState: unknown = Reflect.get(value, 'appState')
  const files: unknown = Reflect.get(value, 'files')
  return {
    elements: Array.isArray(elements) ? elements.filter(isFigureElement) : [],
    appState: isRecord(appState) ? appState : {},
    files: isRecord(files) ? files : {},
    issues: [],
    repairs
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isFigureElement(value: unknown): value is FigureElement {
  return isRecord(value) && typeof value.id === 'string' && typeof value.type === 'string'
}

/** Pretty-printed with a final newline, so diffs of agent and app writes stay readable. */
export function figureFileText(scene: unknown): string {
  return `${JSON.stringify(scene, null, 2)}\n`
}

/** Exports older than the scene (or missing) are rewritten when the figure opens. */
export function figureExportsStale(input: {
  sceneMtime: number
  svgMtime: number | null
  pdfMtime: number | null
}): boolean {
  return (
    input.svgMtime === null ||
    input.pdfMtime === null ||
    input.svgMtime < input.sceneMtime ||
    input.pdfMtime < input.sceneMtime
  )
}

/**
 * A pending area is answered once its frame's children changed since the request, or once the
 * frame is gone.
 */
export function areaAnswered(
  elements: readonly FigureElement[],
  areaId: string,
  childrenAtRequest: string
): boolean {
  if (!elements.some((element) => element.id === areaId && !element.isDeleted)) {
    return true
  }
  return areaChildrenKey(elements, areaId) !== childrenAtRequest
}

export function areaChildrenKey(elements: readonly FigureElement[], areaId: string): string {
  return elements
    .filter((element) => element.frameId === areaId && !element.isDeleted)
    .map(
      (element) =>
        `${element.id}:${Math.round(element.x)},${Math.round(element.y)},${Math.round(element.width)},${Math.round(element.height)},${element.text ?? ''}`
    )
    .sort()
    .join(',')
}

/** Sketch files the agent can open: `sketches/<slug>-<element>.<ext>` beside the figures. */
export function sketchFilePath(
  folder: string,
  slug: string,
  elementId: string,
  mimeType: string
): string {
  const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/webp' ? 'webp' : 'png'
  const safeId = elementId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24) || 'image'
  return `${folder}/sketches/${slug}-${safeId}.${extension}`
}

/** The hash `figures preview` compares: SHA-256 of the scene file's UTF-8 bytes. */
export async function sceneSha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
