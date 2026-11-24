import { create } from 'zustand'
import {
  isResearchWindowPage,
  type ResearchWindowPage
} from '../../../../shared/research-page-window'
import { RESEARCH_SPLIT_MAX_SIDES } from '../../../../shared/research-side-split'
import {
  MAIN_COLUMN,
  equalWeights,
  fitWeights,
  nextResearchSplitColumn,
  type ResearchSplitSide
} from './research-split-layout'
import {
  focusResearchMainColumn,
  focusResearchSideWebview,
  showResearchSideChat,
  showResearchSidePage
} from './research-split-surfaces'

type ResearchSplitState = {
  sides: ResearchSplitSide[]
  /** Flex weights, the main column first. */
  weights: number[]
  /** The column that has the keyboard: MAIN_COLUMN or a side id. */
  focused: string
  /** The window is too narrow for the columns, so they show one at a time, as tabs. */
  tabbed: boolean
}

/** The projects beside the main one in this window; empty when the window shows one project. */
export const useResearchSplit = create<ResearchSplitState>(() => ({
  sides: [],
  weights: [],
  focused: MAIN_COLUMN,
  tabbed: false
}))

export type ResearchSideTarget = {
  workspaceId: string
  hostId: string | null
  page?: ResearchWindowPage
}

let sideCounter = 0

function newSideId(): string {
  sideCounter += 1
  return `side-${Date.now().toString(36)}-${sideCounter.toString(36)}`
}

function sameProject(side: ResearchSplitSide, target: ResearchSideTarget): boolean {
  return side.workspaceId === target.workspaceId && side.hostId === (target.hostId ?? null)
}

/** A project page as a side shows it: the Workbench is that side's Chats. */
export function researchSidePageFor(view: string | undefined): ResearchWindowPage {
  if (isResearchWindowPage(view)) {
    return view
  }
  return 'research-chats'
}

/** Moves the keyboard to a column; `keyboard` also focuses it, as a click would. */
export function focusResearchSplitColumn(id: string, options: { keyboard?: boolean } = {}): void {
  const { sides, focused } = useResearchSplit.getState()
  const known = id === MAIN_COLUMN || sides.some((side) => side.id === id)
  if (!known) {
    return
  }
  if (focused !== id) {
    useResearchSplit.setState({ focused: id })
  }
  if (options.keyboard) {
    if (id === MAIN_COLUMN) {
      focusResearchMainColumn()
    } else {
      focusResearchSideWebview(id)
    }
  }
}

/**
 * Opens a project beside the main one, or goes to the side that already shows it. Never touches
 * the main column's project. 'full' when every side is taken.
 */
export function openResearchSide(target: ResearchSideTarget): 'opened' | 'focused' | 'full' {
  const { sides } = useResearchSplit.getState()
  const existing = sides.find((side) => sameProject(side, target))
  if (existing) {
    if (target.page && target.page !== existing.page) {
      setResearchSidePage(existing.id, target.page)
      showResearchSidePage(existing.id, target.page)
    }
    focusResearchSplitColumn(existing.id, { keyboard: true })
    return 'focused'
  }
  if (sides.length >= RESEARCH_SPLIT_MAX_SIDES) {
    return 'full'
  }
  const side: ResearchSplitSide = {
    id: newSideId(),
    workspaceId: target.workspaceId,
    hostId: target.hostId ?? null,
    page: target.page ?? 'research-chats'
  }
  useResearchSplit.setState({
    sides: [...sides, side],
    weights: equalWeights(sides.length + 2),
    focused: side.id
  })
  return 'opened'
}

export function closeResearchSide(id: string): void {
  const { sides, weights, focused } = useResearchSplit.getState()
  const index = sides.findIndex((side) => side.id === id)
  if (index === -1) {
    return
  }
  const nextSides = sides.filter((side) => side.id !== id)
  useResearchSplit.setState({
    sides: nextSides,
    weights:
      nextSides.length === 0
        ? []
        : fitWeights(
            weights.filter((_, column) => column !== index + 1),
            nextSides.length + 1
          ),
    focused: focused === id ? MAIN_COLUMN : focused
  })
}

/**
 * Closes the main column's place in the split: the first side takes it. Returns that side, for
 * the caller to open in the main column, or null when nothing is beside the main project.
 */
export function takeFirstResearchSideForMain(): ResearchSplitSide | null {
  const [first] = useResearchSplit.getState().sides
  if (!first) {
    return null
  }
  closeResearchSide(first.id)
  useResearchSplit.setState({ focused: MAIN_COLUMN })
  return first
}

/**
 * Shows another project in a side, picked from that side's own switcher or workspace menu; the
 * main column and the other sides stay as they are. A project another side shows already gets
 * the keyboard there instead.
 */
export function replaceResearchSide(id: string, target: ResearchSideTarget): void {
  const { sides } = useResearchSplit.getState()
  const side = sides.find((entry) => entry.id === id)
  if (!side || sameProject(side, target)) {
    return
  }
  const other = sides.find((entry) => entry.id !== id && sameProject(entry, target))
  if (other) {
    focusResearchSplitColumn(other.id, { keyboard: true })
    return
  }
  useResearchSplit.setState({
    sides: sides.map((entry) =>
      entry.id === id
        ? {
            ...entry,
            workspaceId: target.workspaceId,
            hostId: target.hostId ?? null,
            page: target.page ?? entry.page
          }
        : entry
    ),
    focused: id
  })
}

export function setResearchSidePage(id: string, page: ResearchWindowPage): void {
  const { sides } = useResearchSplit.getState()
  if (sides.some((side) => side.id === id && side.page !== page)) {
    useResearchSplit.setState({
      sides: sides.map((side) => (side.id === id ? { ...side, page } : side))
    })
  }
}

export function setResearchSplitWeights(weights: readonly number[]): void {
  const { sides } = useResearchSplit.getState()
  useResearchSplit.setState({ weights: fitWeights(weights, sides.length + 1) })
}

export function setResearchSplitTabbed(tabbed: boolean): void {
  if (useResearchSplit.getState().tabbed !== tabbed) {
    useResearchSplit.setState({ tabbed })
  }
}

export function focusNextResearchSplitColumn(): void {
  const { sides, focused } = useResearchSplit.getState()
  if (sides.length > 0) {
    focusResearchSplitColumn(nextResearchSplitColumn(sides, focused), { keyboard: true })
  }
}

/** The side showing this workspace, if any. */
export function researchSideShowing(workspaceId: string): ResearchSplitSide | null {
  return useResearchSplit.getState().sides.find((side) => side.workspaceId === workspaceId) ?? null
}

/**
 * A notification click for a project a side shows lands in that side, not in the main column,
 * which keeps its project. False when the main column shows it or no side does.
 */
export function revealWorkspaceInResearchSide(
  workspaceId: string,
  mainWorkspaceId: string | null,
  chatTabId?: string
): boolean {
  if (workspaceId === mainWorkspaceId) {
    return false
  }
  const side = researchSideShowing(workspaceId)
  if (!side) {
    return false
  }
  focusResearchSplitColumn(side.id, { keyboard: true })
  if (chatTabId) {
    showResearchSideChat(side.id, chatTabId)
  }
  return true
}
