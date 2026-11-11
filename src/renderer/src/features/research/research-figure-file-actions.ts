import { detectLanguage } from '@/lib/language-detect'
import { revealInFileManager } from '@/lib/reveal-in-file-manager'
import { useAppStore } from '@/store'
import { parseExecutionHostId } from '../../../../shared/execution-host'
import {
  figureFilePaths,
  isFigureSlug
} from '../../../../research-harness/research-figures-model.mjs'
import {
  figurePublicationPath,
  paperCopyPath,
  publicationRecord
} from '../../../../research-harness/research-figures-locations.mjs'
import { bytesSha256, sceneSha256 } from './research-figure-document'
import { moveFigureHistory } from './research-figure-history'
import { figureTrashFolder, figureSceneMeta, withFigureTitle } from './research-figure-list-model'
import { ensureFigureWorkFolder } from './research-figure-listing'
import { renameFigureIncludes } from './research-figure-paper-block'
import { keepPublicationCurrent, renamePublishedCopy } from './research-figure-publish'
import { openResearchView } from './research-navigation'
import {
  base64ToBytes,
  deleteProjectPath,
  listProjectDirectory,
  moveProjectPath,
  projectAbsolutePath,
  projectRecordRoot,
  readProjectFile,
  readProjectText,
  writeProjectBinary,
  writeProjectText,
  type ProjectFileOwner
} from './research-project-files'
import { researchWindowSurfaceTarget } from './research-window-surface'
import { openInMainWindowEditor } from './research-window-tab-actions'

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
  next: {
    slug: string
    title: string | null
    manuscript: string | null
    /** The published figure's manuscript, when it has a copy in the paper. */
    published: string | null
  }
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
    if (next.published) {
      // Why first: a name taken in the paper stops the rename before anything moves.
      await renamePublishedCopy(owner, {
        from: files.slug,
        to: next.slug,
        manuscript: next.published,
        follow: next.manuscript !== null
      })
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
    const retitled = withFigureTitle(text, next.title)
    await writeProjectText(owner, target, retitled, text)
    if (next.published) {
      await keepPublicationCurrent(owner, next.slug, text, retitled)
    }
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

/**
 * Copies the scene under `slug` in the working folder (exports follow when it is opened); the
 * title gets "copy".
 */
export async function duplicateFigure(
  owner: ProjectFileOwner,
  files: FigureFiles,
  slug: string,
  workFolder: string
): Promise<void> {
  const text = await readProjectText(owner, figureFilePaths(files.folder, files.slug).scene)
  const title = figureSceneMeta(text).title
  await ensureFigureWorkFolder(owner, workFolder)
  await writeProjectText(
    owner,
    figureFilePaths(workFolder, slug).scene,
    title ? withFigureTitle(text, `${title} copy`) : text,
    null
  )
}

/**
 * Moves a figure's files into the project's trash; the moves undo the delete. The paper's copy
 * stays unless `paperCopy` names it to go too.
 */
export async function trashFigure(
  owner: ProjectFileOwner,
  files: FigureFiles,
  paperCopy: string | null = null
): Promise<Move[]> {
  const root = await projectRecordRoot(owner)
  const trash = figureTrashFolder(root, files.slug, new Date())
  const moves = (await existingFigureFiles(owner, files)).map((from) => ({
    from,
    to: `${trash}/${from.slice(files.folder.length + 1)}`
  }))
  const record = figurePublicationPath(root, files.slug)
  const published = await readProjectText(owner, record).then(
    () => true,
    () => false
  )
  if (published) {
    moves.push({ from: record, to: `${trash}/published.json` })
  }
  if (paperCopy) {
    moves.push({
      from: paperCopy,
      to: `${trash}/paper/${paperCopy.split('/').pop() ?? 'copy.pdf'}`
    })
  }
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

/**
 * Moves an older figure from beside the manuscript into the working folder. Its PDF stays where
 * the paper reads it and is recorded as the published copy, so later edits stay out of the paper
 * until they are published. Returns what undoes it.
 */
export async function adoptFigure(
  owner: ProjectFileOwner,
  files: FigureFiles,
  input: { workFolder: string; manuscript: string }
): Promise<() => Promise<void>> {
  const paths = figureFilePaths(files.folder, files.slug)
  const target = figureFilePaths(input.workFolder, files.slug)
  const taken = await listProjectDirectory(owner, input.workFolder)
  if (taken?.some((entry) => entry.name === `${files.slug}.excalidraw`)) {
    throw new Error(`${target.scene} already exists.`)
  }
  await ensureFigureWorkFolder(owner, input.workFolder)
  const root = await projectRecordRoot(owner)
  const existing = await existingFigureFiles(owner, files)
  const moves: Move[] = existing
    .filter((path) => path !== paths.pdf)
    .map((from) => ({
      from,
      to: from === paths.script ? target.script : `${input.workFolder}/${from.split('/').pop()}`
    }))
  for (const move of moves) {
    await moveProjectPath(owner, move.from, move.to)
  }
  // Why: a script that names its scene by path must keep drawing into the moved file.
  const repoint = async (from: string, to: string): Promise<void> => {
    if (!existing.includes(paths.script)) {
      return
    }
    const script = from === files.folder ? target.script : paths.script
    const moved = await readProjectText(owner, script)
    const updated = moved.replaceAll(
      `${from}/${files.slug}.excalidraw`,
      `${to}/${files.slug}.excalidraw`
    )
    if (updated !== moved) {
      await writeProjectText(owner, script, updated, moved)
    }
  }
  await repoint(files.folder, input.workFolder)
  const copied = existing.includes(paths.pdf)
  const record = figurePublicationPath(root, files.slug)
  if (copied) {
    const paperPdf = paperCopyPath(input.manuscript, files.slug)
    const scene = await readProjectText(owner, target.scene)
    const file = await readProjectFile(owner, paths.pdf)
    const bytes = file.isBinary
      ? base64ToBytes(file.content)
      : new TextEncoder().encode(file.content)
    await writeProjectBinary(owner, target.pdf, bytes)
    await writeProjectText(
      owner,
      record,
      `${JSON.stringify(
        publicationRecord({
          slug: files.slug,
          pdf: paperPdf,
          pdfSha256: await bytesSha256(bytes),
          sceneSha256: await sceneSha256(scene),
          publishedAt: new Date().toISOString()
        }),
        null,
        2
      )}\n`
    )
  }
  return async () => {
    await restoreFigure(owner, moves)
    await repoint(input.workFolder, files.folder)
    if (copied) {
      await deleteProjectPath(owner, target.pdf).catch(() => undefined)
      await deleteProjectPath(owner, record).catch(() => undefined)
    }
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
  const filePath = projectAbsolutePath(owner, relativePath)
  if (researchWindowSurfaceTarget()) {
    // Why: the Workbench editor is the main window's; this window asks it to open the file there.
    openInMainWindowEditor(
      { workspaceId: owner.workspaceId, hostId: owner.hostId },
      { absolutePath: filePath, relativePath }
    )
    return
  }
  const state = useAppStore.getState()
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
