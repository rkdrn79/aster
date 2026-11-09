// The Node side of where figures live: reads both folders of a project, and makes the working one.
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { readCatalog } from './research-catalog.mjs'
import { HarnessError } from './research-harness-error.mjs'
import { projectLayout } from './research-layout.mjs'
import {
  FIGURE_WORK_GITIGNORE,
  figurePaperState,
  figurePublicationPath,
  figureWorkFolder,
  mergeFigureListings,
  paperCopyPath,
  parsePublicationRecord
} from './research-figures-locations.mjs'
import { figureFilePaths, figuresFolderFor, listFigureFolder } from './research-figures-model.mjs'

const DEFAULT_MANUSCRIPT = 'paper/main.tex'

/** The catalog's manuscript (paper/main.tex without one), project-relative. */
export async function catalogManuscript(project) {
  try {
    return (await readCatalog(project)).manuscript?.source ?? DEFAULT_MANUSCRIPT
  } catch (error) {
    if (!(error instanceof HarnessError) && error?.code !== 'ENOENT') {
      throw error
    }
    return DEFAULT_MANUSCRIPT
  }
}

/** The manuscript's figures folder, from the catalog's manuscript: where the paper's PDFs go. */
export async function figuresFolder(project) {
  return figuresFolderFor(await catalogManuscript(project))
}

/** `<record root>/figures`, where figures are worked on. */
export function workFiguresFolder(project) {
  return figureWorkFolder(projectLayout(project).root)
}

/** Makes the working folder and keeps its exports out of Git; returns its relative path. */
export async function ensureWorkFolder(project) {
  const folder = workFiguresFolder(project)
  await mkdir(path.join(project, folder), { recursive: true })
  await writeFile(path.join(project, folder, '.gitignore'), FIGURE_WORK_GITIGNORE, {
    flag: 'wx'
  }).catch((error) => {
    if (error?.code !== 'EEXIST') {
      throw error
    }
  })
  return folder
}

export async function folderEntries(directory) {
  try {
    return (await readdir(directory, { withFileTypes: true })).map((entry) => ({
      name: entry.name,
      isDirectory: entry.isDirectory()
    }))
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return []
    }
    throw error
  }
}

export async function readPublication(project, slug) {
  const file = path.join(project, figurePublicationPath(projectLayout(project).root, slug))
  return parsePublicationRecord(await readFile(file, 'utf8').catch(() => ''))
}

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

async function paperState(project, figure, manuscript) {
  const record = await readPublication(project, figure.slug)
  const expectedPdf = paperCopyPath(manuscript, figure.slug)
  const [copy, scene] = await Promise.all([
    readFile(path.join(project, expectedPdf)).catch(() => null),
    readFile(path.join(project, figure.scene)).catch(() => null)
  ])
  return {
    published: record,
    paperPdf: expectedPdf,
    paper: figurePaperState({
      location: figure.location,
      record,
      paperCopy: copy !== null,
      expectedPdf,
      sceneSha256: scene ? sha256(scene) : null
    })
  }
}

/** Every figure of the project, from its working folder and the manuscript's. */
export async function listFigures(project) {
  const manuscript = await catalogManuscript(project)
  const workFolder = workFiguresFolder(project)
  const paperFolder = figuresFolderFor(manuscript)
  const [workEntries, paperEntries] = await Promise.all([
    folderEntries(path.join(project, workFolder)),
    folderEntries(path.join(project, paperFolder))
  ])
  const merged = mergeFigureListings({
    workFolder,
    work: listFigureFolder(workEntries),
    paperFolder,
    paper: listFigureFolder(paperEntries)
  })
  const figures = await Promise.all(
    merged.figures.map(async (figure) => {
      const located = { ...figure, ...figureFilePaths(figure.folder, figure.slug) }
      return { ...located, ...(await paperState(project, located, manuscript)) }
    })
  )
  return {
    folder: workFolder,
    paperFolder,
    figures,
    others: merged.others.map((entry) => ({ ...entry, path: `${entry.folder}/${entry.name}` })),
    shadowed: merged.shadowed.map((entry) => ({
      ...entry,
      scene: figureFilePaths(entry.folder, entry.slug).scene
    }))
  }
}

/** Library folders for a figure in `figureFolder`: its own first, then the project's others. */
export async function figureLibraryFolders(project, figureFolder) {
  const folders = [
    figureFolder,
    path.join(project, workFiguresFolder(project)),
    path.join(project, await figuresFolder(project))
  ].map((folder) => path.join(folder, 'library'))
  return [...new Set(folders)]
}
