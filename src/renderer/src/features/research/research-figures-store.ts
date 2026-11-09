import { useEffect } from 'react'
import { create } from 'zustand'
import {
  figureFilePaths,
  figuresFolderFor,
  isFigureSlug,
  newFigureScene,
  type FigureSize
} from '../../../../research-harness/research-figures-model.mjs'
import {
  figureWorkFolder,
  type FigureListing,
  type FigurePublication,
  type ListedFigure
} from '../../../../research-harness/research-figures-locations.mjs'
import { figureFileText } from './research-figure-document'
import { withFigureTitle } from './research-figure-list-model'
import { ensureFigureWorkFolder, readFigureListing } from './research-figure-listing'
import {
  ProjectWriteConflict,
  projectOwnerKey,
  projectRecordRoot,
  writeProjectText,
  type ProjectFileOwner
} from './research-project-files'

export type FigureSelection = { kind: 'figure'; slug: string } | { kind: 'file'; name: string }

type FiguresState = {
  ownerKey: string | null
  /** The project whose figures these are, for reading a figure outside the editor. */
  owner: ProjectFileOwner | null
  /** Project-relative working folder, `<record root>/figures`: where new figures go. */
  folder: string | null
  /** The manuscript's figures folder, e.g. `paper/figures`: what the paper reads. */
  paperFolder: string | null
  manuscript: string | null
  listing: FigureListing
  /** Project-relative path → size:mtime of every listed file, so thumbnails follow rewrites. */
  signatures: Record<string, string>
  /** slug → the record of what the paper's copy of that figure was made from. */
  publications: Record<string, FigurePublication>
  /** size:mtime of the manuscript, so "In paper" badges follow edits to it. */
  manuscriptSignature: string
  selected: FigureSelection | null
  loading: boolean
  error: string | null
}

const EMPTY_LISTING: FigureListing = { figures: [], others: [], shadowed: [] }
const INITIAL: FiguresState = {
  ownerKey: null,
  owner: null,
  folder: null,
  paperFolder: null,
  manuscript: null,
  listing: EMPTY_LISTING,
  signatures: {},
  publications: {},
  manuscriptSignature: '',
  selected: null,
  loading: false,
  error: null
}
const SELECTED_KEY = 'aster.research-figures-selected.v1'
const REFRESH_MS = 3000
export const DEFAULT_MANUSCRIPT = 'paper/main.tex'

export const useResearchFigures = create<FiguresState>(() => INITIAL)

let loadToken = 0

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function readRemembered(ownerKey: string): FigureSelection | null {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(SELECTED_KEY) ?? '{}')
    const entry: unknown = saved && typeof saved === 'object' ? Reflect.get(saved, ownerKey) : null
    if (!entry || typeof entry !== 'object') {
      return null
    }
    const kind: unknown = Reflect.get(entry, 'kind')
    const value: unknown = Reflect.get(entry, kind === 'figure' ? 'slug' : 'name')
    if (typeof value !== 'string') {
      return null
    }
    return kind === 'figure'
      ? { kind, slug: value }
      : kind === 'file'
        ? { kind, name: value }
        : null
  } catch {
    return null
  }
}

function remember(ownerKey: string, selection: FigureSelection): void {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(SELECTED_KEY) ?? '{}')
    const next = saved && typeof saved === 'object' && !Array.isArray(saved) ? { ...saved } : {}
    localStorage.setItem(SELECTED_KEY, JSON.stringify({ ...next, [ownerKey]: selection }))
  } catch {
    // Why: without storage the page opens the first figure next time.
  }
}

function stillListed(listing: FigureListing, selection: FigureSelection | null) {
  if (!selection) {
    return false
  }
  return selection.kind === 'figure'
    ? listing.figures.some((figure) => figure.slug === selection.slug)
    : listing.others.some((entry) => entry.name === selection.name)
}

function firstSelection(listing: FigureListing): FigureSelection | null {
  return listing.figures[0]
    ? { kind: 'figure', slug: listing.figures[0].slug }
    : listing.others[0]
      ? { kind: 'file', name: listing.others[0].name }
      : null
}

/** The listed figure with this name: where it lives and what files it has. */
export function listedFigure(listing: FigureListing, slug: string): ListedFigure | null {
  return listing.figures.find((figure) => figure.slug === slug) ?? null
}

/** Lists the project's figures (working folder and manuscript's) and opens the last or the first. */
export async function openFiguresProject(
  owner: ProjectFileOwner,
  manuscript: string | null,
  prefer?: FigureSelection
): Promise<void> {
  const token = ++loadToken
  const ownerKey = projectOwnerKey(owner)
  const same = useResearchFigures.getState().ownerKey === ownerKey
  useResearchFigures.setState({
    ...(same ? {} : INITIAL),
    ownerKey,
    owner,
    loading: true,
    error: null
  })
  try {
    const source = manuscript ?? DEFAULT_MANUSCRIPT
    const folder = figureWorkFolder(await projectRecordRoot(owner))
    const paperFolder = figuresFolderFor(source)
    const snapshot = await readFigureListing(owner, { work: folder, paper: paperFolder }, source)
    const { listing, signatures, publications, manuscriptSignature } = snapshot
    if (token !== loadToken) {
      return
    }
    const candidates = [
      prefer ?? null,
      useResearchFigures.getState().selected,
      readRemembered(ownerKey)
    ]
    const selected =
      candidates.find((entry) => stillListed(listing, entry)) ?? firstSelection(listing)
    useResearchFigures.setState({
      folder,
      paperFolder,
      manuscript: source,
      listing,
      signatures,
      publications,
      manuscriptSignature,
      selected,
      loading: false
    })
  } catch (error) {
    if (token === loadToken) {
      useResearchFigures.setState({ loading: false, error: errorText(error) })
    }
  }
}

export function selectFigure(
  owner: Pick<ProjectFileOwner, 'hostId' | 'workspaceId'>,
  selection: FigureSelection
): void {
  const ownerKey = projectOwnerKey(owner)
  remember(ownerKey, selection)
  const current = useResearchFigures.getState().ownerKey
  // Why: another project's page must not switch; this project's opens on it from `remember`.
  if (current === null || current === ownerKey) {
    useResearchFigures.setState({ selected: selection })
  }
}

/** The figure a project shows, or remembers from last time; null when it has none open. */
export function openFigureSlug(
  owner: Pick<ProjectFileOwner, 'hostId' | 'workspaceId'>
): string | null {
  const ownerKey = projectOwnerKey(owner)
  const state = useResearchFigures.getState()
  const selection = state.ownerKey === ownerKey ? state.selected : readRemembered(ownerKey)
  return selection?.kind === 'figure' ? selection.slug : null
}

/** Picks up figures an agent or a plot script added, renamed or rewrote. */
export async function refreshFigureList(owner: ProjectFileOwner): Promise<void> {
  const { folder, paperFolder, ownerKey, loading, listing, signatures, selected, manuscript } =
    useResearchFigures.getState()
  if (!folder || !paperFolder || loading || ownerKey !== projectOwnerKey(owner)) {
    return
  }
  const next = await readFigureListing(
    owner,
    { work: folder, paper: paperFolder },
    manuscript ?? DEFAULT_MANUSCRIPT
  )
  const current = useResearchFigures.getState()
  if (current.ownerKey !== ownerKey || current.folder !== folder) {
    return
  }
  if (
    JSON.stringify(next.listing) === JSON.stringify(listing) &&
    JSON.stringify(next.signatures) === JSON.stringify(signatures) &&
    JSON.stringify(next.publications) === JSON.stringify(current.publications) &&
    next.manuscriptSignature === current.manuscriptSignature
  ) {
    return
  }
  useResearchFigures.setState({
    ...next,
    // Why: a figure deleted or renamed elsewhere leaves the first one open, not a missing file.
    selected: stillListed(next.listing, current.selected)
      ? current.selected
      : stillListed(next.listing, selected)
        ? selected
        : firstSelection(next.listing)
  })
}

export function useFigureListAutoRefresh(owner: ProjectFileOwner | null): void {
  useEffect(() => {
    if (!owner) {
      return
    }
    const check = (): void => void refreshFigureList(owner).catch(() => undefined)
    const timer = window.setInterval(check, REFRESH_MS)
    window.addEventListener('focus', check)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', check)
    }
  }, [owner])
}

/**
 * Writes a new scene with the page frame and opens it; refuses a slug that is taken. A `title`
 * that reads differently from the file name is kept on the page for the figure list.
 */
export async function createFigure(
  owner: ProjectFileOwner,
  slug: string,
  size: FigureSize,
  title?: string
): Promise<void> {
  const { folder } = useResearchFigures.getState()
  if (!folder) {
    throw new Error('The figures folder is not known yet.')
  }
  if (!isFigureSlug(slug)) {
    throw new Error('Use letters, digits and dashes for the file name.')
  }
  const path = figureFilePaths(folder, slug).scene
  try {
    await ensureFigureWorkFolder(owner, folder)
    const text = figureFileText(newFigureScene(size))
    const named =
      title?.trim() && title.trim() !== slug ? withFigureTitle(text, title.trim()) : text
    await writeProjectText(owner, path, named, null)
  } catch (error) {
    throw error instanceof ProjectWriteConflict ? new Error(`${path} already exists.`) : error
  }
  await refreshFigureList(owner)
  selectFigure(owner, { kind: 'figure', slug })
}
