import { create } from 'zustand'

/** Below this window width the figure list starts as the thumbnail strip. */
export const LIST_STRIP_BELOW = 1440
/** Below this window width the side panel floats over the canvas as a drawer. */
export const SIDE_DRAWER_BELOW = 1200
export const STRIP_WIDTH = 56

export type FiguresLayoutPrefs = {
  windowWidth: number
  /** ⌘. : list as a strip, side panel folded into a pill under the canvas. */
  focus: boolean
  /** The docked side panel, at wide windows; remembered. */
  sideOpen: boolean
  /** The drawer, at narrow windows; starts closed so the canvas keeps the room. */
  drawerOpen: boolean
  /** What the user chose for the list this session; null follows the window width. */
  listOverride: 'full' | 'strip' | null
}

export type FiguresLayoutMode = {
  list: 'full' | 'strip'
  side: 'docked' | 'drawer' | 'hidden'
  /** The agent input pill under the canvas, when the side panel is out of the way. */
  pill: boolean
}

export function figuresLayoutMode(prefs: FiguresLayoutPrefs): FiguresLayoutMode {
  const narrow = prefs.windowWidth < SIDE_DRAWER_BELOW
  const list = prefs.focus
    ? 'strip'
    : (prefs.listOverride ?? (prefs.windowWidth < LIST_STRIP_BELOW ? 'strip' : 'full'))
  if (prefs.focus) {
    return { list, side: 'hidden', pill: true }
  }
  if (narrow) {
    return { list, side: prefs.drawerOpen ? 'drawer' : 'hidden', pill: !prefs.drawerOpen }
  }
  return { list, side: prefs.sideOpen ? 'docked' : 'hidden', pill: false }
}

const PREFS_KEY = 'aster.research-figures-layout.v1'
// Why: the agent pane's open state predates this store; keep what people chose.
const LEGACY_AGENT_OPEN_KEY = 'aster.research-figures-agent-open.v1'

function readStored(): Pick<FiguresLayoutPrefs, 'focus' | 'sideOpen'> {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null')
    if (saved && typeof saved === 'object') {
      return {
        focus: Reflect.get(saved, 'focus') === true,
        sideOpen: Reflect.get(saved, 'sideOpen') !== false
      }
    }
    return { focus: false, sideOpen: localStorage.getItem(LEGACY_AGENT_OPEN_KEY) !== 'false' }
  } catch {
    return { focus: false, sideOpen: true }
  }
}

function store(prefs: FiguresLayoutPrefs): void {
  try {
    localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({ focus: prefs.focus, sideOpen: prefs.sideOpen })
    )
  } catch {
    // Why: without storage the layout still toggles for this session.
  }
}

export const useFiguresLayout = create<FiguresLayoutPrefs>(() => ({
  windowWidth: typeof window === 'undefined' ? 1600 : window.innerWidth,
  drawerOpen: false,
  listOverride: null,
  ...readStored()
}))

function update(change: (current: FiguresLayoutPrefs) => Partial<FiguresLayoutPrefs>): void {
  useFiguresLayout.setState(change)
  store(useFiguresLayout.getState())
}

export function setFiguresWindowWidth(windowWidth: number): void {
  useFiguresLayout.setState({ windowWidth })
}

/** ⌘\ : the side panel in or out; leaves focus mode for it. */
export function toggleFiguresSidePanel(): void {
  update((current) => {
    const mode = figuresLayoutMode(current)
    const showing = mode.side !== 'hidden'
    return current.windowWidth < SIDE_DRAWER_BELOW
      ? { focus: false, drawerOpen: !showing }
      : { focus: false, sideOpen: !showing }
  })
}

/** Shows the side panel (an agent request was sent, a tab was asked for). */
export function openFiguresSidePanel(): void {
  update((current) =>
    current.windowWidth < SIDE_DRAWER_BELOW
      ? { focus: false, drawerOpen: true }
      : { focus: false, sideOpen: true }
  )
}

export function closeFiguresDrawer(): void {
  useFiguresLayout.setState({ drawerOpen: false })
}

/** ⌘. */
export function toggleFiguresFocus(): void {
  update((current) => ({ focus: !current.focus, drawerOpen: false }))
}

export function setFiguresListMode(list: 'full' | 'strip'): void {
  update(() => ({ listOverride: list, ...(list === 'full' ? { focus: false } : {}) }))
}
