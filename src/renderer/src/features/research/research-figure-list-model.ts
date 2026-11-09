import { PAGE_FRAME_ID } from '../../../../research-harness/research-figures-model.mjs'

/** Search and sort show up once a project has this many figures. */
export const FIGURE_SEARCH_FROM = 6

export type FigureSort = 'recent' | 'name'

export type FigureListEntry = { slug: string; title: string | null; modified: number }

/** The page frame's human title and the agent's proposed caption, read from a scene file. */
export type FigureSceneMeta = { title: string | null; caption: string | null }

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function figureSceneMeta(sceneText: string): FigureSceneMeta {
  try {
    const scene: unknown = JSON.parse(sceneText)
    const elements: unknown =
      scene && typeof scene === 'object' ? Reflect.get(scene, 'elements') : null
    if (!Array.isArray(elements)) {
      return { title: null, caption: null }
    }
    const frame: unknown = elements.find(
      (element: unknown) =>
        element &&
        typeof element === 'object' &&
        Reflect.get(element, 'type') === 'frame' &&
        Reflect.get(element, 'isDeleted') !== true &&
        (Reflect.get(element, 'id') === PAGE_FRAME_ID ||
          Boolean(Reflect.get(Reflect.get(element, 'customData') ?? {}, 'asterPage')))
    )
    const customData: unknown =
      frame && typeof frame === 'object' ? Reflect.get(frame, 'customData') : null
    const page: unknown =
      customData && typeof customData === 'object' ? Reflect.get(customData, 'asterPage') : null
    if (!page || typeof page !== 'object') {
      return { title: null, caption: null }
    }
    return { title: text(Reflect.get(page, 'title')), caption: text(Reflect.get(page, 'caption')) }
  } catch {
    return { title: null, caption: null }
  }
}

/** The scene with the page's title set (or cleared), for a rename. */
export function withFigureTitle(sceneText: string, title: string | null): string {
  const scene: unknown = JSON.parse(sceneText)
  const elements: unknown =
    scene && typeof scene === 'object' ? Reflect.get(scene, 'elements') : null
  if (!Array.isArray(elements)) {
    return sceneText
  }
  for (const element of elements) {
    const customData: unknown =
      element && typeof element === 'object' ? Reflect.get(element, 'customData') : null
    const page: unknown =
      customData && typeof customData === 'object' ? Reflect.get(customData, 'asterPage') : null
    if (page && typeof page === 'object') {
      if (title) {
        Reflect.set(page, 'title', title)
      } else {
        Reflect.deleteProperty(page, 'title')
      }
      break
    }
  }
  return `${JSON.stringify(scene, null, 2)}\n`
}

/** Figures matching the query (title or file name), newest or alphabetical first. */
export function filterFigures<T extends FigureListEntry>(
  entries: readonly T[],
  query: string,
  sort: FigureSort
): T[] {
  const needle = query.trim().toLowerCase()
  const matches = needle
    ? entries.filter(
        (entry) =>
          entry.slug.toLowerCase().includes(needle) ||
          (entry.title?.toLowerCase().includes(needle) ?? false)
      )
    : [...entries]
  return matches.sort((a, b) =>
    sort === 'recent'
      ? b.modified - a.modified || a.slug.localeCompare(b.slug)
      : (a.title ?? a.slug).localeCompare(b.title ?? b.slug)
  )
}

/** `base-copy`, then `base-copy-2`, … : the first file name no figure uses. */
export function uniqueFigureSlug(base: string, taken: ReadonlySet<string>): string {
  const stem = `${base}-copy`.slice(0, 58)
  if (!taken.has(stem)) {
    return stem
  }
  for (let index = 2; ; index += 1) {
    const candidate = `${stem}-${index}`
    if (!taken.has(candidate)) {
      return candidate
    }
  }
}

/** Where Delete puts a figure's files: a dated folder under the record tree's trash. */
export function figureTrashFolder(recordRoot: string, slug: string, now: Date): string {
  const stamp = now.toISOString().replace(/[:.]/g, '-')
  return `${recordRoot}/trash/figures/${stamp}-${slug}`
}

export type FigureExportState = 'fresh' | 'outdated' | 'missing'

/** Whether the PDF the paper includes matches the scene: older than it, or not written yet. */
export function figureExportState(
  sceneSignature: string,
  pdfSignature: string | undefined
): FigureExportState {
  const mtime = (signature: string | undefined): number =>
    Number(signature?.split(':')[1] ?? Number.NaN)
  const scene = mtime(sceneSignature)
  const pdf = mtime(pdfSignature)
  if (!Number.isFinite(scene)) {
    return 'fresh'
  }
  return !Number.isFinite(pdf) ? 'missing' : pdf + 1 < scene ? 'outdated' : 'fresh'
}
