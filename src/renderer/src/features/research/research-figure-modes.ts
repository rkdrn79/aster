import { useSyncExternalStore } from 'react'
import { writingAgentScopeKey } from '../../../../shared/research/research-conversation-context'

// The Figure agent's switches: careful drawing, references and a concept image. Each project keeps
// its own choice; Settings → Research holds the defaults a project without one follows. Kept on
// this device like the reading language, since the reference folder they name lives here too.

export type FigureSketchPick = 'agent' | 'person'

/**
 * How the concept image is used: redrawn as shapes, or hybrid (generated art kept for the
 * illustrative parts only, textless, with every word, arrow and count drawn as vector over it).
 */
export type FigureConceptStyle = 'redraw' | 'hybrid'

export type FigureModes = {
  /** Sketches first, then a separate art director's rounds. */
  careful: boolean
  /** The art director's rounds (N). */
  rounds: number
  /** Who picks among the sketches. */
  pick: FigureSketchPick
  /** The `figures refs` step before drawing. */
  references: boolean
  /** Reference ids the person pinned for this project (none in the defaults). */
  pinned: readonly string[]
  /** Experimental: an image model's concept image, redrawn as shapes or kept as hybrid art. */
  concept: boolean
  conceptStyle: FigureConceptStyle
}

export const FIGURE_CAREFUL_ROUNDS = { min: 1, max: 10, standard: 3 } as const

/** The two ways to use the concept image, with what each does. */
export const FIGURE_CONCEPT_STYLES: readonly {
  id: FigureConceptStyle
  label: string
  detail: string
}[] = [
  {
    id: 'redraw',
    label: 'Concept → redraw',
    detail:
      'Codex draws a concept image first; the agent redraws it as editable shapes and takes every word from the paper. With careful drawing it is one of the sketches.'
  },
  {
    id: 'hybrid',
    label: 'Hybrid art + vector text',
    detail:
      'Codex draws only the illustrative parts (3D scenes, objects, photo planes), without text; the agent lays out the figure and draws every word, arrow and count over them as editable vector.'
  }
]

export const FIGURE_PINNED_MAX = 4

type StoredModes = {
  careful?: boolean
  rounds?: number
  pick?: FigureSketchPick
  references?: boolean
  pinned?: string[]
  concept?: boolean
  conceptStyle?: FigureConceptStyle
  at?: number
}

export type FigureModesSaved = {
  defaults: StoredModes
  projects: Record<string, StoredModes>
  /** The reference folder; absent is Aster's app-data folder. */
  folder?: string
}

const STORAGE_KEY = 'aster.figures.modes.v1'
const MAX_PROJECTS = 100
const EMPTY: FigureModesSaved = { defaults: {}, projects: {} }
const listeners = new Set<() => void>()
let cached: { raw: string | null; saved: FigureModesSaved } = { raw: null, saved: EMPTY }
/** Set only when this device refuses to save, so the choice still holds in this window. */
let unsaved: FigureModesSaved | null = null

function rounds(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value)
    ? Math.min(FIGURE_CAREFUL_ROUNDS.max, Math.max(FIGURE_CAREFUL_ROUNDS.min, value))
    : undefined
}

function storedModes(value: unknown): StoredModes {
  if (!value || typeof value !== 'object') {
    return {}
  }
  const read = (key: string): unknown => Reflect.get(value, key)
  const flag = (key: string): boolean | undefined =>
    typeof read(key) === 'boolean' ? Boolean(read(key)) : undefined
  const pinned = read('pinned')
  const pick = read('pick')
  const style = read('conceptStyle')
  const at = read('at')
  return {
    careful: flag('careful'),
    rounds: rounds(read('rounds')),
    pick: pick === 'agent' || pick === 'person' ? pick : undefined,
    references: flag('references'),
    pinned: Array.isArray(pinned)
      ? pinned.filter((id): id is string => typeof id === 'string').slice(0, FIGURE_PINNED_MAX)
      : undefined,
    concept: flag('concept'),
    conceptStyle: style === 'redraw' || style === 'hybrid' ? style : undefined,
    at: typeof at === 'number' ? at : undefined
  }
}

/** The saved switches, parsed once per change of the stored text. */
export function parseFigureModesSaved(raw: string | null): FigureModesSaved {
  try {
    const value: unknown = raw ? JSON.parse(raw) : null
    if (!value || typeof value !== 'object') {
      return EMPTY
    }
    const projects: unknown = Reflect.get(value, 'projects')
    const folder: unknown = Reflect.get(value, 'folder')
    return {
      defaults: storedModes(Reflect.get(value, 'defaults')),
      projects:
        projects && typeof projects === 'object'
          ? Object.fromEntries(
              Object.entries(projects).map(([key, entry]) => [key, storedModes(entry)])
            )
          : {},
      ...(typeof folder === 'string' && folder.trim() ? { folder: folder.trim() } : {})
    }
  } catch {
    return EMPTY
  }
}

export function readFigureModesSaved(): FigureModesSaved {
  if (unsaved) {
    return unsaved
  }
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(STORAGE_KEY)
  } catch {
    raw = null
  }
  if (raw !== cached.raw) {
    cached = { raw, saved: parseFigureModesSaved(raw) }
  }
  return cached.saved
}

function write(next: FigureModesSaved): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    unsaved = null
  } catch {
    unsaved = next
  }
  for (const listener of listeners) {
    listener()
  }
}

export function subscribeFigureModes(listener: () => void): () => void {
  listeners.add(listener)
  const onStorage = (event: StorageEvent): void => {
    if (event.key === STORAGE_KEY) {
      listener()
    }
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

/** The defaults a new project follows: careful off, references on when a folder exists, concept off (redraw when on). */
export function figureModeDefaults(saved: FigureModesSaved, folderExists: boolean): FigureModes {
  const stored = saved.defaults
  return {
    careful: stored.careful ?? false,
    rounds: stored.rounds ?? FIGURE_CAREFUL_ROUNDS.standard,
    pick: stored.pick ?? 'agent',
    references: stored.references ?? folderExists,
    pinned: [],
    concept: stored.concept ?? false,
    conceptStyle: stored.conceptStyle ?? 'redraw'
  }
}

/** One project's switches: its own choices over the defaults. */
export function projectFigureModes(
  saved: FigureModesSaved,
  scope: { hostId: string; workspaceId: string },
  folderExists: boolean
): FigureModes {
  const defaults = figureModeDefaults(saved, folderExists)
  const own = saved.projects[writingAgentScopeKey(scope)] ?? {}
  return {
    careful: own.careful ?? defaults.careful,
    rounds: own.rounds ?? defaults.rounds,
    pick: own.pick ?? defaults.pick,
    references: own.references ?? defaults.references,
    pinned: own.pinned ?? [],
    concept: own.concept ?? defaults.concept,
    conceptStyle: own.conceptStyle ?? defaults.conceptStyle
  }
}

/** Whether the project chose anything itself (so "Use defaults" has something to undo). */
export function projectHasOwnFigureModes(
  saved: FigureModesSaved,
  scope: { hostId: string; workspaceId: string }
): boolean {
  const own = saved.projects[writingAgentScopeKey(scope)]
  return Boolean(
    own && Object.entries(own).some(([key, value]) => key !== 'at' && value !== undefined)
  )
}

type ModesPatch = Partial<Omit<FigureModes, 'pinned'>> & { pinned?: readonly string[] }

function clean(patch: ModesPatch): StoredModes {
  return storedModes({ ...patch, pinned: patch.pinned ? [...patch.pinned] : undefined })
}

function defined(modes: StoredModes): StoredModes {
  return Object.fromEntries(Object.entries(modes).filter(([, value]) => value !== undefined))
}

/** Sets switches for one project; the most recently changed hundred projects are kept. */
export function setProjectFigureModes(
  scope: { hostId: string; workspaceId: string },
  patch: ModesPatch
): void {
  const saved = readFigureModesSaved()
  const key = writingAgentScopeKey(scope)
  const own = { ...saved.projects[key], ...defined(clean(patch)), at: Date.now() }
  const kept = Object.entries({ ...saved.projects, [key]: own })
    .toSorted(([, first], [, second]) => (second.at ?? 0) - (first.at ?? 0))
    .slice(0, MAX_PROJECTS)
  write({ ...saved, projects: Object.fromEntries(kept) })
}

/** Drops a project's own switches (its pins too), so it follows the defaults again. */
export function resetProjectFigureModes(scope: { hostId: string; workspaceId: string }): void {
  const saved = readFigureModesSaved()
  const { [writingAgentScopeKey(scope)]: _dropped, ...projects } = saved.projects
  write({ ...saved, projects })
}

/** Sets the defaults in Settings → Research. */
export function setFigureModeDefaults(patch: Omit<ModesPatch, 'pinned'>): void {
  const saved = readFigureModesSaved()
  write({ ...saved, defaults: { ...saved.defaults, ...defined(clean(patch)) } })
}

/** The reference folder; null or blank goes back to Aster's app-data folder. */
export function setFigureReferenceFolder(folder: string | null): void {
  const { folder: _old, ...saved } = readFigureModesSaved()
  write(folder?.trim() ? { ...saved, folder: folder.trim() } : saved)
}

export function useFigureModesSaved(): FigureModesSaved {
  return useSyncExternalStore(subscribeFigureModes, readFigureModesSaved, () => EMPTY)
}

/**
 * How much longer careful drawing takes than one pass: sketches (half a pass), the drawing, and
 * half a pass per art director round.
 */
export function carefulSlowdown(roundCount: number): number {
  return Math.round(1.5 + 0.5 * roundCount)
}
