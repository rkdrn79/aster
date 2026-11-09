import { useEffect } from 'react'
import { create } from 'zustand'
import {
  figureFilePaths,
  figuresFolderFor,
  isFigureSlug,
  listFigureFolder,
  newFigureScene,
  type FigureFolderListing,
  type FigureSize
} from '../../../../research-harness/research-figures-model.mjs'
import { figureFileText } from './research-figure-document'
import { withFigureTitle } from './research-figure-list-model'
import {
  ProjectWriteConflict,
  listProjectDirectory,
  projectFileSignature,
  projectOwnerKey,
  writeProjectText,
  type ProjectFileOwner
} from './research-project-files'

export type FigureSelection = { kind: 'figure'; slug: string } | { kind: 'file'; name: string }

type FiguresState = {
  ownerKey: string | null
  /** Project-relative, e.g. `paper/figures`. */
  folder: string | null
  manuscript: string | null
  listing: FigureFolderListing
  /** name → size:mtime of every listed file, so thumbnails follow rewrites. */
  signatures: Record<string, string>
  /** size:mtime of the manuscript, so "In paper" badges follow edits to it. */
  manuscriptSignature: string
  selected: FigureSelection | null
  loading: boolean
  error: string | null
}

const EMPTY_LISTING: FigureFolderListing = { figures: [], others: [] }
const INITIAL: FiguresState = {
  ownerKey: null,
  folder: null,
  manuscript: null,
  listing: EMPTY_LISTING,
  signatures: {},
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

function stillListed(listing: FigureFolderListing, selection: FigureSelection | null) {
  if (!selection) {
    return false
  }
  return selection.kind === 'figure'
    ? listing.figures.some((figure) => figure.slug === selection.slug)
    : listing.others.some((entry) => entry.name === selection.name)
}

function firstSelection(listing: FigureFolderListing): FigureSelection | null {
  return listing.figures[0]
    ? { kind: 'figure', slug: listing.figures[0].slug }
    : listing.others[0]
      ? { kind: 'file', name: listing.others[0].name }
      : null
}

async function readListing(owner: ProjectFileOwner, folder: string, manuscript: string) {
  const entries = (await listProjectDirectory(owner, folder)) ?? []
  const listing = listFigureFolder(entries)
  const names = [
    ...listing.figures.flatMap((figure) => [
      `${figure.slug}.excalidraw`,
      ...(figure.svg ? [`${figure.slug}.svg`] : []),
      ...(figure.pdf ? [`${figure.slug}.pdf`] : [])
    ]),
    ...listing.others.map((entry) => entry.name)
  ]
  const signatures: Record<string, string> = {}
  await Promise.all(
    names.map(async (name) => {
      signatures[name] = await projectFileSignature(owner, `${folder}/${name}`).then(
        (stat) => stat.signature,
        () => ''
      )
    })
  )
  const manuscriptSignature = await projectFileSignature(owner, manuscript).then(
    (stat) => stat.signature,
    () => ''
  )
  return { listing, signatures, manuscriptSignature }
}

/** Lists `<manuscript folder>/figures` and opens the figure picked last time (or the first). */
export async function openFiguresProject(
  owner: ProjectFileOwner,
  manuscript: string | null,
  prefer?: FigureSelection
): Promise<void> {
  const token = ++loadToken
  const ownerKey = projectOwnerKey(owner)
  const same = useResearchFigures.getState().ownerKey === ownerKey
  useResearchFigures.setState({ ...(same ? {} : INITIAL), ownerKey, loading: true, error: null })
  try {
    const source = manuscript ?? DEFAULT_MANUSCRIPT
    const folder = figuresFolderFor(source)
    const { listing, signatures, manuscriptSignature } = await readListing(owner, folder, source)
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
      manuscript: source,
      listing,
      signatures,
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

export function selectFigure(owner: ProjectFileOwner, selection: FigureSelection): void {
  remember(projectOwnerKey(owner), selection)
  useResearchFigures.setState({ selected: selection })
}

/** Picks up figures an agent or a plot script added, renamed or rewrote. */
export async function refreshFigureList(owner: ProjectFileOwner): Promise<void> {
  const { folder, ownerKey, loading, listing, signatures, selected, manuscript } =
    useResearchFigures.getState()
  if (!folder || loading || ownerKey !== projectOwnerKey(owner)) {
    return
  }
  const next = await readListing(owner, folder, manuscript ?? DEFAULT_MANUSCRIPT)
  const current = useResearchFigures.getState()
  if (current.ownerKey !== ownerKey || current.folder !== folder) {
    return
  }
  if (
    JSON.stringify(next.listing) === JSON.stringify(listing) &&
    JSON.stringify(next.signatures) === JSON.stringify(signatures) &&
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
