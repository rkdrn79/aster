import { describe, expect, it } from 'vitest'
import type { ResearchHomeWorkspace } from './research-home-projects'
import {
  buildProjectSwitcherRows,
  filterProjectSwitcherRows,
  previousResearchProject,
  projectSwitcherKeyIntent,
  projectSwitcherValue
} from './research-project-switcher'

function workspace(
  id: string,
  executionHostId?: ResearchHomeWorkspace['executionHostId']
): ResearchHomeWorkspace {
  return {
    id,
    executionHostId,
    name: id,
    path: `/work/${id}`,
    branch: 'main',
    isMain: true,
    isFolder: false,
    repoId: id,
    lastVisitedAt: 0
  }
}

// Already in recency order, as buildResearchHomeProjects returns them.
const PROJECTS = [
  { key: 'diffusion', name: 'Diffusion Policy', badgeColor: null, workspaces: [workspace('wd')] },
  {
    key: 'sparse',
    name: 'SparseDiff detector',
    badgeColor: '#0a0',
    workspaces: [workspace('ws', 'ssh:gpu')]
  },
  { key: 'empty', name: 'Nothing open', badgeColor: null, workspaces: [] },
  { key: 'llm', name: 'LLM reasoning', badgeColor: null, workspaces: [workspace('wl')] }
]

const describeHost = (entry: ResearchHomeWorkspace) =>
  entry.executionHostId === 'ssh:gpu' ? { label: 'gpu-box', status: 'Disconnected' } : null

describe('buildProjectSwitcherRows', () => {
  it('lists the other projects most recent first, so the first row is the previous one', () => {
    const rows = buildProjectSwitcherRows(PROJECTS, 'sparse', describeHost)
    expect(rows.map((row) => row.key)).toEqual(['diffusion', 'llm'])
    expect(rows[0]).toMatchObject({
      value: projectSwitcherValue('diffusion'),
      host: null,
      workspace: { id: 'wd' }
    })
  })

  it('names the host of a remote project and its connection', () => {
    const rows = buildProjectSwitcherRows(PROJECTS, 'diffusion', describeHost)
    expect(rows[0]).toMatchObject({
      key: 'sparse',
      host: { label: 'gpu-box', status: 'Disconnected' },
      workspace: { id: 'ws' }
    })
  })

  it('lists every project with a workspace on Home, where none is open', () => {
    const rows = buildProjectSwitcherRows(PROJECTS, null, describeHost)
    expect(rows.map((row) => row.key)).toEqual(['diffusion', 'sparse', 'llm'])
  })
})

describe('filterProjectSwitcherRows', () => {
  const rows = buildProjectSwitcherRows(PROJECTS, null, describeHost)
  const keys = (query: string) => filterProjectSwitcherRows(rows, query).map((row) => row.key)

  it('returns every row for an empty query', () => {
    expect(keys('  ')).toEqual(['diffusion', 'sparse', 'llm'])
  })

  it('matches name prefixes, words, initials and host labels, ignoring case', () => {
    expect(keys('spa')).toEqual(['sparse'])
    expect(keys('POLICY')).toEqual(['diffusion'])
    expect(keys('dp')).toEqual(['diffusion'])
    expect(keys('gpu')).toEqual(['sparse'])
    expect(keys('reason llm')).toEqual(['llm'])
    expect(keys('zzz')).toEqual([])
    // Letters scattered through a name are not a match.
    expect(keys('sd')).toEqual(['sparse'])
    expect(keys('pd')).toEqual([])
  })

  it('ranks a prefix above a word match above a substring, ties in recency order', () => {
    const ranked = buildProjectSwitcherRows(
      [
        { key: 'a', name: 'Old diffusion notes', badgeColor: null, workspaces: [workspace('a')] },
        { key: 'b', name: 'Prediffusion', badgeColor: null, workspaces: [workspace('b')] },
        { key: 'c', name: 'Diffusion v2', badgeColor: null, workspaces: [workspace('c')] },
        { key: 'd', name: 'Diffusion v3', badgeColor: null, workspaces: [workspace('d')] }
      ],
      null,
      () => null
    )
    expect(filterProjectSwitcherRows(ranked, 'diff').map((row) => row.key)).toEqual([
      'c',
      'd',
      'a',
      'b'
    ])
  })
})

describe('previousResearchProject', () => {
  it('is the most recent other project with a workspace', () => {
    expect(previousResearchProject(PROJECTS, 'diffusion')?.key).toBe('sparse')
    expect(previousResearchProject(PROJECTS, 'sparse')?.key).toBe('diffusion')
  })

  it('is the latest project from Home, and nothing when there is no other', () => {
    expect(previousResearchProject(PROJECTS, null)?.key).toBe('diffusion')
    expect(previousResearchProject(PROJECTS.slice(0, 1), 'diffusion')).toBeNull()
  })
})

describe('projectSwitcherKeyIntent', () => {
  const key = (overrides: Partial<KeyboardEvent>) => ({
    key: 'Enter',
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    isComposing: false,
    ...overrides
  })

  it('opens the highlighted project in a new window on Cmd+Enter (Ctrl+Enter off macOS)', () => {
    expect(projectSwitcherKeyIntent(key({ metaKey: true }), 'darwin')).toBe('open-in-new-window')
    expect(projectSwitcherKeyIntent(key({ ctrlKey: true }), 'linux')).toBe('open-in-new-window')
    expect(projectSwitcherKeyIntent(key({ ctrlKey: true }), 'darwin')).toBeNull()
  })

  it('leaves plain Enter, arrows and IME input to the list', () => {
    expect(projectSwitcherKeyIntent(key({}), 'darwin')).toBeNull()
    expect(projectSwitcherKeyIntent(key({ key: 'ArrowDown', metaKey: true }), 'darwin')).toBeNull()
    expect(projectSwitcherKeyIntent(key({ metaKey: true, isComposing: true }), 'darwin')).toBeNull()
  })
})
