import { detectLanguage } from '@/lib/language-detect'
import { revealInFileManager } from '@/lib/reveal-in-file-manager'
import { useAppStore } from '@/store'
import { parseExecutionHostId } from '../../../../shared/execution-host'
import {
  figureFilePaths,
  isFigureSlug
} from '../../../../research-harness/research-figures-model.mjs'
import { moveFigureHistory } from './research-figure-history'
import { figureTrashFolder, figureSceneMeta, withFigureTitle } from './research-figure-list-model'
import { renameFigureIncludes } from './research-figure-paper-block'
import { openResearchView } from './research-navigation'
import {
  listProjectDirectory,
  moveProjectPath,
  projectAbsolutePath,
  projectRecordRoot,
  readProjectText,
  writeProjectText,
  type ProjectFileOwner
} from './research-project-files'

export type FigureFiles = { folder: string; slug: string }
type Move = { from: string; to: string }

/** The kit script that draws a figure, kept beside the figures so it can be rerun. */
export function figureScriptPath(folder: string, slug: string): string {
  return `${folder}/src/${slug}.figure.mjs`
}

export function figureIncludeLine(slug: string): string {
  return `\\includegraphics{figures/${slug}.pdf}`
}

/** Every file of a figure that exists: the scene, its exports, and its script. */
async function existingFigureFiles(owner: ProjectFileOwner, files: FigureFiles): Promise<string[]> {
  const paths = figureFilePaths(files.folder, files.slug)
  const [folder, scripts] = await Promise.all([
    listProjectDirectory(owner, files.folder),
    listProjectDirectory(owner, `${files.folder}/src`)
  ])
  const names = new Set((folder ?? []).map((entry) => entry.name))
  const scriptName = `${files.slug}.figure.mjs`
  return [
    ...[paths.scene, paths.svg, paths.pdf, paths.png].filter((path) =>
      names.has(path.slice(files.folder.length + 1))
    ),
    ...((scripts ?? []).some((entry) => entry.name === scriptName)
      ? [figureScriptPath(files.folder, files.slug)]
      : [])
  ]
}

export async function figureScriptExists(owner: ProjectFileOwner, files: FigureFiles) {
  const scripts = await listProjectDirectory(owner, `${files.folder}/src`).catch(() => null)
  return Boolean(scripts?.some((entry) => entry.name === `${files.slug}.figure.mjs`))
}

function renamedPath(path: string, files: FigureFiles, slug: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1)
  const folder = path.slice(0, path.lastIndexOf('/'))
  return `${folder}/${slug}${base.slice(files.slug.length)}`
}

/**
 * Renames a figure's files to `slug`, sets its title, and (when asked) rewrites the
 * manuscript's `\includegraphics` lines; resolves to how many lines changed.
 */
export async function renameFigure(
  owner: ProjectFileOwner,
  files: FigureFiles,
  next: { slug: string; title: string | null; manuscript: string | null }
): Promise<number> {
  if (!isFigureSlug(next.slug)) {
    throw new Error('Use letters, digits and dashes for the file name.')
  }
  const target = figureFilePaths(files.folder, next.slug).scene
  if (next.slug !== files.slug) {
    const taken = await listProjectDirectory(owner, files.folder)
    if (taken?.some((entry) => entry.name === target.slice(files.folder.length + 1))) {
      throw new Error(`${target} already exists.`)
    }
    const moved = await existingFigureFiles(owner, files)
    for (const path of moved) {
      await moveProjectPath(owner, path, renamedPath(path, files, next.slug))
    }
    await moveFigureHistory(owner, files.slug, next.slug)
    // Why: the kit script opens its figure by path; it must keep drawing into the renamed file.
    const script = figureScriptPath(files.folder, files.slug)
    if (moved.includes(script)) {
      const scriptPath = figureScriptPath(files.folder, next.slug)
      const source = await readProjectText(owner, scriptPath)
      const updated = source.replaceAll(`${files.slug}.excalidraw`, `${next.slug}.excalidraw`)
      if (updated !== source) {
        await writeProjectText(owner, scriptPath, updated, source)
      }
    }
  }
  const text = await readProjectText(owner, target)
  if (figureSceneMeta(text).title !== next.title) {
    await writeProjectText(owner, target, withFigureTitle(text, next.title), text)
  }
  if (!next.manuscript || next.slug === files.slug) {
    return 0
  }
  const manuscript = await readProjectText(owner, next.manuscript)
  const renamed = renameFigureIncludes(manuscript, files.slug, next.slug)
  if (renamed.count) {
    await writeProjectText(owner, next.manuscript, renamed.text, manuscript)
  }
  return renamed.count
}

/** Copies the scene under `slug` (exports follow when it is opened); the title gets "copy". */
export async function duplicateFigure(
  owner: ProjectFileOwner,
  files: FigureFiles,
  slug: string
): Promise<void> {
  const text = await readProjectText(owner, figureFilePaths(files.folder, files.slug).scene)
  const title = figureSceneMeta(text).title
  await writeProjectText(
    owner,
    figureFilePaths(files.folder, slug).scene,
    title ? withFigureTitle(text, `${title} copy`) : text,
    null
  )
}

/** Moves a figure's files into the project's trash; the moves undo the delete. */
export async function trashFigure(owner: ProjectFileOwner, files: FigureFiles): Promise<Move[]> {
  const trash = figureTrashFolder(await projectRecordRoot(owner), files.slug, new Date())
  const moves = (await existingFigureFiles(owner, files)).map((from) => ({
    from,
    to: `${trash}/${from.slice(files.folder.length + 1)}`
  }))
  for (const move of moves) {
    await moveProjectPath(owner, move.from, move.to)
  }
  return moves
}

export async function restoreFigure(owner: ProjectFileOwner, moves: readonly Move[]) {
  for (const move of moves) {
    await moveProjectPath(owner, move.to, move.from)
  }
}

export function revealFigure(owner: ProjectFileOwner, files: FigureFiles): Promise<void> {
  return revealInFileManager(
    projectAbsolutePath(owner, figureFilePaths(files.folder, files.slug).scene),
    parseExecutionHostId(owner.hostId)?.id ?? 'unresolved'
  )
}

/** Opens a project file in the Workbench editor, as Writing's "Open in editor" does. */
export function openProjectFileInEditor(owner: ProjectFileOwner, relativePath: string): void {
  const state = useAppStore.getState()
  const filePath = projectAbsolutePath(owner, relativePath)
  const groupId =
    state.activeGroupIdByWorktree[owner.workspaceId] ??
    state.ensureWorktreeRootGroup(owner.workspaceId)
  state.openFile(
    {
      filePath,
      relativePath,
      worktreeId: owner.workspaceId,
      language: detectLanguage(filePath),
      mode: 'edit'
    },
    { preview: false, focusEditor: true, targetGroupId: groupId }
  )
  state.setActiveTabType('editor', owner.workspaceId)
  openResearchView('terminal')
}
