import type { ExcalidrawImperativeAPI, LibraryItems } from '@excalidraw/excalidraw/types'
import { figureSlug } from '../../../../research-harness/research-figures-model.mjs'
import { selectedFigureElements } from './research-figure-requests'
import {
  listProjectDirectory,
  readProjectText,
  writeProjectText,
  type ProjectFileOwner
} from './research-project-files'

export type FigurePartScope = 'project' | 'user'

/** The .excalidrawlib text of one part, the format the Figure kit's library reads too. */
export function figurePartLibraryText(name: string, elements: readonly unknown[]): string {
  const item = {
    id: `aster-part-${figureSlug(name)}`,
    status: 'unpublished',
    created: Date.now(),
    name,
    elements
  }
  const library = { type: 'excalidrawlib', version: 2, source: 'aster', libraryItems: [item] }
  return `${JSON.stringify(library, null, 2)}\n`
}

/** Library items from a saved part file, with ids unique to where it was saved. */
export function figurePartItems(text: string, scope: FigurePartScope, file: string): LibraryItems {
  try {
    // Why JSON.parse's any: Excalidraw restores library items itself; this only types them.
    const parsed = JSON.parse(text)
    const items: LibraryItems = Array.isArray(parsed?.libraryItems) ? parsed.libraryItems : []
    return items.map((item, index) => ({ ...item, id: `aster-${scope}-${file}-${index}` }))
  } catch {
    return []
  }
}

/** The project's parts (`<figures>/library/`) and the person's, for the library panel. */
export async function loadSavedFigureParts(
  owner: ProjectFileOwner,
  folder: string
): Promise<LibraryItems> {
  const directory = `${folder}/library`
  const entries = (await listProjectDirectory(owner, directory).catch(() => null)) ?? []
  const project: LibraryItems[] = []
  for (const entry of entries.filter((item) => item.name.endsWith('.excalidrawlib'))) {
    const text = await readProjectText(owner, `${directory}/${entry.name}`).catch(() => '')
    project.push(figurePartItems(text, 'project', entry.name))
  }
  const user = (await window.api.researchFigures?.listUserParts().catch(() => [])) ?? []
  return [
    ...project.flat(),
    ...user.flatMap((part) => figurePartItems(part.text, 'user', part.file))
  ]
}

/**
 * Saves the selection (with the labels bound to it) as a named part: in the project, committed
 * beside the figures, or for every project in the app's data. Returns where it was written.
 */
export async function saveFigurePart(
  api: ExcalidrawImperativeAPI,
  target: { owner: ProjectFileOwner; folder: string },
  name: string,
  scope: FigurePartScope
): Promise<string> {
  const selected = selectedFigureElements(api)
  const ids = new Set(selected.map((element) => element.id))
  const elements = api
    .getSceneElements()
    .filter(
      (element) =>
        ids.has(element.id) ||
        (element.type === 'text' && element.containerId !== null && ids.has(element.containerId))
    )
  const text = figurePartLibraryText(name, elements)
  let written: string
  if (scope === 'project') {
    written = `${target.folder}/library/${figureSlug(name)}.excalidrawlib`
    await writeProjectText(target.owner, written, text)
  } else {
    const save = window.api.researchFigures?.saveUserPart
    if (!save) {
      throw new Error('Update Aster to save parts for every project.')
    }
    written = await save({ name, library: text })
  }
  await api.updateLibrary({ libraryItems: figurePartItems(text, scope, written), merge: true })
  return written
}
