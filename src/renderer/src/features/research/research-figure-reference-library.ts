import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import { parseExecutionHostId } from '../../../../shared/execution-host'
import {
  projectFigureModes,
  readFigureModesSaved,
  useFigureModesSaved,
  type FigureConceptStyle,
  type FigureModes,
  type FigureModesSaved,
  type FigureSketchPick
} from './research-figure-modes'

// What the Figure agent's switches need from this computer: the reference folder (where it is,
// whether it exists, what it holds) and whether Codex can draw a concept image here.

export type FigureReferenceEntry = {
  id: string
  image: string | null
  title: string | null
  year: number | null
  genre: string | null
  recipe: boolean
}

export type FigureConceptSupport = { available: boolean; reason: string | null }

type LibraryState = {
  loaded: boolean
  /** The folder in use (the setting, or Aster's app-data folder). */
  folder: string | null
  defaultFolder: string | null
  exists: boolean
  entries: readonly FigureReferenceEntry[]
  error: string | null
  concept: FigureConceptSupport | null
}

export const useFigureReferenceLibrary = create<LibraryState>(() => ({
  loaded: false,
  folder: null,
  defaultFolder: null,
  exists: false,
  entries: [],
  error: null,
  concept: null
}))

const NO_BRIDGE = 'This build cannot read the reference folder.'

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

let loading: Promise<void> | null = null

/** Reads the reference folder again (after a setting changed or an image was added). */
export function loadFigureReferenceLibrary(): Promise<void> {
  const api = window.api.researchFigures
  if (!api?.referenceLibrary) {
    useFigureReferenceLibrary.setState({ loaded: true, error: NO_BRIDGE })
    return Promise.resolve()
  }
  const folder = readFigureModesSaved().folder ?? null
  const run = api
    .referenceLibrary({ folder })
    .then((library) =>
      useFigureReferenceLibrary.setState({
        loaded: true,
        folder: library.folder,
        defaultFolder: library.defaultFolder,
        exists: library.exists,
        entries: library.entries,
        error: null
      })
    )
    .catch((cause: unknown) =>
      useFigureReferenceLibrary.setState({ loaded: true, exists: false, error: errorText(cause) })
    )
  loading = run.finally(() => {
    loading = null
  })
  return loading
}

/** Loads once per app run; the Figures page and Settings call it when they open. */
export function ensureFigureReferenceLibrary(): Promise<void> {
  if (useFigureReferenceLibrary.getState().loaded) {
    return Promise.resolve()
  }
  return loading ?? loadFigureReferenceLibrary()
}

/** Asks main whether Codex has image generation on this computer (once, unless refreshed). */
export async function loadFigureConceptSupport(refresh = false): Promise<void> {
  const check = window.api.researchFigures?.codexImageGeneration
  if (!check) {
    useFigureReferenceLibrary.setState({
      concept: { available: false, reason: 'This build cannot check for Codex.' }
    })
    return
  }
  const concept = await check({ refresh }).catch((cause: unknown): FigureConceptSupport => ({
    available: false,
    reason: errorText(cause)
  }))
  useFigureReferenceLibrary.setState({ concept })
}

/** Adds an image file to the reference folder and lists the folder again; null or what failed. */
export async function addFigureReferenceFile(file: File): Promise<string | null> {
  const add = window.api.researchFigures?.addReference
  if (!add) {
    return NO_BRIDGE
  }
  if (!/^image\/(png|jpeg)$/.test(file.type)) {
    return 'Choose a PNG or JPEG image.'
  }
  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    let binary = ''
    for (let index = 0; index < bytes.length; index += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
    }
    await add({
      folder: readFigureModesSaved().folder ?? null,
      name: file.name,
      base64: btoa(binary)
    })
    await loadFigureReferenceLibrary()
    return null
  } catch (cause) {
    return errorText(cause)
  }
}

/** A project's switches as they apply now: concept stays off where Codex cannot draw it. */
export function effectiveFigureModes(
  saved: FigureModesSaved,
  scope: { hostId: string; workspaceId: string },
  library: Pick<LibraryState, 'exists' | 'concept'>
): FigureModes {
  const modes = projectFigureModes(saved, scope, library.exists)
  return { ...modes, concept: modes.concept && library.concept?.available === true }
}

/** A project's switches as the panel shows them, following the folder and Codex checks. */
export function useEffectiveFigureModes(scope: {
  hostId: string
  workspaceId: string
}): FigureModes {
  const saved = useFigureModesSaved()
  const library = useFigureReferenceLibrary(
    useShallow((state) => ({ exists: state.exists, concept: state.concept }))
  )
  return effectiveFigureModes(saved, scope, library)
}

/** What a Figure prompt says about the switches. */
export type FigurePromptModes = {
  careful: { rounds: number; pick: FigureSketchPick } | null
  /** Null when references are off. */
  references: {
    pinned: readonly string[]
    /** The folder to pass as --library; only for a project on this computer. */
    library: string | null
  } | null
  concept: boolean
  /** How the concept image is used when it is on; absent is 'redraw'. */
  conceptStyle?: FigureConceptStyle
}

export function figurePromptModes(
  modes: FigureModes,
  input: { hostId: string; folder: string | null; exists: boolean }
): FigurePromptModes {
  const local = parseExecutionHostId(input.hostId)?.kind === 'local'
  return {
    careful: modes.careful ? { rounds: modes.rounds, pick: modes.pick } : null,
    references: modes.references
      ? { pinned: modes.pinned, library: local && input.exists ? input.folder : null }
      : null,
    concept: modes.concept,
    conceptStyle: modes.conceptStyle
  }
}

/** The switches a prompt about this project carries right now. */
export function currentFigurePromptModes(scope: {
  hostId: string
  workspaceId: string
}): FigurePromptModes {
  const library = useFigureReferenceLibrary.getState()
  return figurePromptModes(effectiveFigureModes(readFigureModesSaved(), scope, library), {
    hostId: scope.hostId,
    folder: library.folder,
    exists: library.exists
  })
}
