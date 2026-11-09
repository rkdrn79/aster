import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { figureSlug } from '../../../../research-harness/research-figures-model.mjs'
import type { InsertItem } from './research-figure-insert-catalog'
import {
  figurePartItems,
  figurePartLibraryText,
  saveFigurePart,
  type FigurePartScope
} from './research-figure-saved-parts'
import {
  deleteProjectPath,
  listProjectDirectory,
  readProjectText,
  writeProjectText,
  type ProjectFileOwner
} from './research-project-files'

export type PartsProject = { owner: ProjectFileOwner; folder: string }

function items(text: string, scope: FigurePartScope, file: string): InsertItem[] {
  return figurePartItems(text, scope, file).map((item, index) => ({
    key: `mine:${scope}:${file}:${index}`,
    name: item.name ?? file.replace(/\.excalidrawlib$/, ''),
    category: 'mine',
    description: scope === 'project' ? `Saved in ${file}` : 'Saved for every project',
    saved: { scope, file, elements: item.elements }
  }))
}

/** The project's saved parts (`<figures>/library/`) and the person's own, as insert items. */
export async function loadMyParts(project: PartsProject): Promise<InsertItem[]> {
  const directory = `${project.folder}/library`
  const entries = (await listProjectDirectory(project.owner, directory).catch(() => null)) ?? []
  const own: InsertItem[] = []
  for (const entry of entries.filter((item) => item.name.endsWith('.excalidrawlib'))) {
    const text = await readProjectText(project.owner, `${directory}/${entry.name}`).catch(() => '')
    own.push(...items(text, 'project', entry.name))
  }
  const user = (await window.api.researchFigures?.listUserParts().catch(() => [])) ?? []
  return [...own, ...user.flatMap((part) => items(part.text, 'user', part.file))]
}

async function removeFile(project: PartsProject, scope: FigurePartScope, file: string) {
  if (scope === 'project') {
    await deleteProjectPath(project.owner, `${project.folder}/library/${file}`)
    return
  }
  const remove = window.api.researchFigures?.deleteUserPart
  if (!remove) {
    throw new Error('Update Aster to delete parts saved for every project.')
  }
  await remove({ file })
}

export async function deleteMyPart(project: PartsProject, item: InsertItem): Promise<void> {
  if (item.saved) {
    await removeFile(project, item.saved.scope, item.saved.file)
  }
}

/** Saves the part under a new name (its own file) and drops the old file. */
export async function renameMyPart(
  project: PartsProject,
  item: InsertItem,
  name: string
): Promise<void> {
  const saved = item.saved
  if (!saved || !name.trim()) {
    return
  }
  const text = figurePartLibraryText(name.trim(), saved.elements)
  if (saved.scope === 'project') {
    const file = `${figureSlug(name)}.excalidrawlib`
    await writeProjectText(project.owner, `${project.folder}/library/${file}`, text)
    if (file !== saved.file) {
      await removeFile(project, 'project', saved.file)
    }
    return
  }
  const save = window.api.researchFigures?.saveUserPart
  if (!save) {
    throw new Error('Update Aster to rename parts saved for every project.')
  }
  const written = await save({ name: name.trim(), library: text })
  if (!written.endsWith(saved.file)) {
    await removeFile(project, 'user', saved.file)
  }
}

/** Replaces the part's contents with the selection, under the same name and scope. */
export async function updateMyPart(
  api: ExcalidrawImperativeAPI,
  project: PartsProject,
  item: InsertItem
): Promise<void> {
  if (item.saved) {
    await saveFigurePart(api, project, item.name, item.saved.scope)
  }
}
