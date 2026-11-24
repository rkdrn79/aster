import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from '@/store'
import {
  closeResearchSide,
  openResearchSide,
  revealWorkspaceInResearchSide,
  takeFirstResearchSideForMain,
  useResearchSplit
} from './research-split-store'
import { researchSidePageForView } from './research-side-page'
import { sideSidebarCollapsed } from './research-side-sidebar'
import { runResearchSideCommand } from './use-research-split-commands'

const MAIN = 'repo-a::/work/a'

function sideFor(workspaceId: string) {
  const side = useResearchSplit.getState().sides.find((entry) => entry.workspaceId === workspaceId)
  if (!side) {
    throw new Error(`no side for ${workspaceId}`)
  }
  return side
}

/** The main column still shows its own project and page. */
function expectMainUntouched(): void {
  const state = useAppStore.getState()
  expect(state.activeWorktreeId).toBe(MAIN)
  expect(state.activeView).toBe('research-writing')
}

beforeEach(() => {
  useResearchSplit.setState({ sides: [], weights: [], focused: 'main', tabbed: false })
  useAppStore.setState({ activeWorktreeId: MAIN, activeView: 'research-writing' })
})

describe('opening projects beside the main one', () => {
  it('adds sides without moving the main column, up to the limit', () => {
    expect(openResearchSide({ workspaceId: 'repo-b::/b', hostId: null })).toBe('opened')
    expect(
      openResearchSide({
        workspaceId: 'repo-c::/c',
        hostId: 'runtime:gpu',
        page: 'research-figures'
      })
    ).toBe('opened')
    expect(openResearchSide({ workspaceId: 'repo-d::/d', hostId: null })).toBe('full')

    expect(useResearchSplit.getState().sides.map((side) => side.page)).toEqual([
      'research-chats',
      'research-figures'
    ])
    expect(useResearchSplit.getState().weights).toEqual([1, 1, 1])
    expectMainUntouched()
  })

  it('goes to the side that already shows a project instead of opening it twice', () => {
    openResearchSide({ workspaceId: 'repo-b::/b', hostId: null })
    openResearchSide({ workspaceId: 'repo-c::/c', hostId: null })
    expect(openResearchSide({ workspaceId: 'repo-b::/b', hostId: null })).toBe('focused')
    expect(useResearchSplit.getState().sides).toHaveLength(2)
    expect(useResearchSplit.getState().focused).toBe(sideFor('repo-b::/b').id)
  })
})

describe('what a side asks of the main window', () => {
  beforeEach(() => {
    openResearchSide({ workspaceId: 'repo-b::/b', hostId: null })
    openResearchSide({ workspaceId: 'repo-c::/c', hostId: null })
  })

  it('changes that side only, never another side or the main project', () => {
    const b = sideFor('repo-b::/b')
    runResearchSideCommand(b.id, { kind: 'page', page: 'research-library' })
    runResearchSideCommand(b.id, { kind: 'focus' })

    expect(sideFor('repo-b::/b').page).toBe('research-library')
    expect(sideFor('repo-c::/c').page).toBe('research-chats')
    expect(useResearchSplit.getState().focused).toBe(b.id)
    expectMainUntouched()

    runResearchSideCommand(b.id, { kind: 'close' })
    expect(useResearchSplit.getState().sides.map((side) => side.workspaceId)).toEqual([
      'repo-c::/c'
    ])
    expect(useResearchSplit.getState().focused).toBe('main')
    expect(useResearchSplit.getState().weights).toEqual([1, 1])
    expectMainUntouched()
  })

  it('a click on Experiments in the right side’s sidebar moves that side only', () => {
    const b = sideFor('repo-b::/b')
    // The side's sidebar sets its own view; it reports the page it now shows.
    runResearchSideCommand(b.id, {
      kind: 'page',
      page: researchSidePageForView('research-experiments', 'research-chats')
    })
    expect(sideFor('repo-b::/b').page).toBe('research-experiments')
    expect(sideFor('repo-c::/c').page).toBe('research-chats')
    expectMainUntouched()
  })

  it('shows another project in the side its own switcher picked it from', () => {
    const b = sideFor('repo-b::/b')
    runResearchSideCommand(b.id, { kind: 'replace', workspaceId: 'repo-e::/e', hostId: 'ssh:vip' })

    const sides = useResearchSplit.getState().sides
    expect(sides.map((side) => [side.id, side.workspaceId, side.hostId])).toEqual([
      [b.id, 'repo-e::/e', 'ssh:vip'],
      [sideFor('repo-c::/c').id, 'repo-c::/c', null]
    ])
    expectMainUntouched()
  })

  it('goes to the other side rather than showing one project twice', () => {
    const b = sideFor('repo-b::/b')
    const c = sideFor('repo-c::/c')
    runResearchSideCommand(b.id, { kind: 'replace', workspaceId: 'repo-c::/c', hostId: null })
    expect(sideFor('repo-b::/b').id).toBe(b.id)
    expect(useResearchSplit.getState().focused).toBe(c.id)
  })

  it('ignores requests from a side that is already gone', () => {
    const before = useResearchSplit.getState()
    runResearchSideCommand('side-gone', { kind: 'focus' })
    runResearchSideCommand('side-gone', { kind: 'page', page: 'research-figures' })
    closeResearchSide('side-gone')
    expect(useResearchSplit.getState().sides).toEqual(before.sides)
    expect(useResearchSplit.getState().focused).toBe(before.focused)
  })
})

describe('notifications about a project shown beside the main one', () => {
  it('land in that side and leave the main column on its project', () => {
    openResearchSide({ workspaceId: 'repo-b::/b', hostId: null })
    useResearchSplit.setState({ focused: 'main' })

    expect(revealWorkspaceInResearchSide('repo-b::/b', MAIN, 'tab-1')).toBe(true)
    expect(useResearchSplit.getState().focused).toBe(sideFor('repo-b::/b').id)
    expectMainUntouched()
  })

  it('are the main window’s when it shows the project or no side does', () => {
    openResearchSide({ workspaceId: MAIN, hostId: null })
    expect(revealWorkspaceInResearchSide(MAIN, MAIN)).toBe(false)
    expect(revealWorkspaceInResearchSide('repo-z::/z', MAIN)).toBe(false)
  })
})

it('hands the first side to the main column only when asked to close the main project', () => {
  openResearchSide({ workspaceId: 'repo-b::/b', hostId: null, page: 'research-figures' })
  const taken = takeFirstResearchSideForMain()
  expect(taken).toMatchObject({ workspaceId: 'repo-b::/b', page: 'research-figures' })
  expect(useResearchSplit.getState().sides).toEqual([])
  expect(takeFirstResearchSideForMain()).toBeNull()
})

describe('a side’s own pages and sidebar', () => {
  it('reports its Workbench as Chats and an Experiment’s pages as Experiments', () => {
    expect(researchSidePageForView('terminal', 'research-writing')).toBe('research-chats')
    expect(researchSidePageForView('research-runs', 'research-chats')).toBe('research-experiments')
    expect(researchSidePageForView('research-figures', 'research-chats')).toBe('research-figures')
    expect(researchSidePageForView('settings', 'research-library')).toBe('research-library')
  })

  it('folds the sidebar to icons when narrow, unless opened there by hand', () => {
    expect(sideSidebarCollapsed({ collapsed: false, narrowExpanded: false }, true)).toBe(true)
    expect(sideSidebarCollapsed({ collapsed: false, narrowExpanded: true }, true)).toBe(false)
    expect(sideSidebarCollapsed({ collapsed: true, narrowExpanded: false }, false)).toBe(true)
    expect(sideSidebarCollapsed({ collapsed: false, narrowExpanded: true }, false)).toBe(false)
  })
})
