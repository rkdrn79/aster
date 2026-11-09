// "My parts": figure parts saved for reuse as Excalidraw library files, per project in
// `<figures>/library/` (committed) and per person in Aster's app data. The kit lists and places
// them with fresh ids, and saves a part an agent drew when the person asks.
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { elementBounds } from './research-figures-geometry.mjs'
import { figureSlug } from './research-figures-model.mjs'

/** Where the app keeps the person's parts on this computer (ASTER_FIGURE_LIBRARY overrides). */
export function userLibraryDirectory() {
  if (process.env.ASTER_FIGURE_LIBRARY) {
    return process.env.ASTER_FIGURE_LIBRARY
  }
  const home = os.homedir()
  if (process.platform === 'darwin') {
    return path.join(home, 'Library/Application Support/Aster/figure-library')
  }
  if (process.platform === 'win32') {
    return path.join(
      process.env.APPDATA ?? path.join(home, 'AppData/Roaming'),
      'Aster/figure-library'
    )
  }
  return path.join(
    process.env.XDG_CONFIG_HOME ?? path.join(home, '.config'),
    'Aster/figure-library'
  )
}

/** The parts in one library folder: `{ name, scope, file, elements }`. */
export async function readLibraryFolder(folder, scope) {
  const names = await readdir(folder).catch(() => [])
  const parts = []
  for (const name of names.filter((entry) => entry.endsWith('.excalidrawlib')).sort()) {
    try {
      const library = JSON.parse(await readFile(path.join(folder, name), 'utf8'))
      const items = library.libraryItems ?? library.library?.map((elements) => ({ elements })) ?? []
      for (const [index, item] of items.entries()) {
        parts.push({
          name:
            item.name ||
            (items.length > 1
              ? `${name.replace(/\.excalidrawlib$/, '')}-${index + 1}`
              : name.replace(/\.excalidrawlib$/, '')),
          scope,
          file: path.join(folder, name),
          elements: (item.elements ?? []).filter((element) => !element.isDeleted)
        })
      }
    } catch {
      // Why: one broken file must not hide the other parts.
    }
  }
  return parts
}

/** The library file text for one part. */
export function libraryFileText(name, elements) {
  return `${JSON.stringify(
    {
      type: 'excalidrawlib',
      version: 2,
      source: 'aster',
      libraryItems: [
        { id: `aster-part-${figureSlug(name)}`, status: 'unpublished', created: 1, name, elements }
      ]
    },
    null,
    2
  )}\n`
}

export async function writeLibraryPart(folder, name, elements) {
  await mkdir(folder, { recursive: true })
  const file = path.join(folder, `${figureSlug(name)}.excalidrawlib`)
  await writeFile(file, libraryFileText(name, elements))
  return file
}

/**
 * A part's elements at (x, y) with ids `<id>` (its largest shape, the arrow target) and
 * `<id>-<n>`; bindings, labels and groups follow the new ids.
 */
export function placeLibraryPart(part, { id, x = 0, y = 0, frame = null }) {
  const elements = structuredClone(part.elements)
  const shapes = elements.filter((element) =>
    ['rectangle', 'ellipse', 'diamond'].includes(element.type)
  )
  const main = shapes.toSorted((a, b) => b.width * b.height - a.width * a.height)[0] ?? elements[0]
  const ids = new Map(
    elements.map((element, index) => [element.id, element === main ? id : `${id}-${index}`])
  )
  const groups = new Map()
  const group = (old) => {
    if (!groups.has(old)) {
      groups.set(old, `${id}-g${groups.size + 1}`)
    }
    return groups.get(old)
  }
  const boxes = elements.map(elementBounds)
  const left = Math.min(...boxes.map((box) => box.x))
  const top = Math.min(...boxes.map((box) => box.y))
  for (const element of elements) {
    element.id = ids.get(element.id)
    element.x += x - left
    element.y += y - top
    element.frameId = frame
    element.groupIds = (element.groupIds ?? []).map(group)
    if (element.containerId) {
      element.containerId = ids.get(element.containerId) ?? null
    }
    element.boundElements = (element.boundElements ?? [])
      .filter((bound) => ids.has(bound.id))
      .map((bound) => ({ ...bound, id: ids.get(bound.id) }))
    for (const side of ['startBinding', 'endBinding']) {
      if (element[side]) {
        element[side] = ids.has(element[side].elementId)
          ? { ...element[side], elementId: ids.get(element[side].elementId) }
          : null
      }
    }
  }
  return elements
}
