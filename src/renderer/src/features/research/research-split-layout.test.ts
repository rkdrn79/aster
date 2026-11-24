import { describe, expect, it } from 'vitest'
import {
  RESEARCH_SPLIT_MIN_COLUMN_PX,
  isResearchSplitTabbed,
  nextResearchSplitColumn,
  parsePersistedResearchSplit,
  resizeWeights
} from './research-split-layout'

describe('resizing the columns', () => {
  it('trades width between the two columns at the divider only', () => {
    const next = resizeWeights([1, 1, 1], 0, 100, 3000)
    expect(next[0]).toBeCloseTo(1.1)
    expect(next[1]).toBeCloseTo(0.9)
    expect(next[2]).toBe(1)
  })

  it('never makes a column narrower than a page can use', () => {
    const next = resizeWeights([1, 1], 0, -2000, 1000)
    expect((next[0] / (next[0] + next[1])) * 1000).toBeCloseTo(RESEARCH_SPLIT_MIN_COLUMN_PX)
  })
})

describe('falling back to tabs', () => {
  it('shows columns as tabs once they no longer fit side by side', () => {
    expect(isResearchSplitTabbed(RESEARCH_SPLIT_MIN_COLUMN_PX * 2, 2)).toBe(false)
    expect(isResearchSplitTabbed(RESEARCH_SPLIT_MIN_COLUMN_PX * 2 - 1, 2)).toBe(true)
    // Before the first measure there is no width; one column never needs tabs.
    expect(isResearchSplitTabbed(0, 3)).toBe(false)
    expect(isResearchSplitTabbed(100, 1)).toBe(false)
  })
})

it('moves the keyboard through the main column and the sides, round again', () => {
  const sides = [{ id: 'side-a' }, { id: 'side-b' }]
  expect(nextResearchSplitColumn(sides, 'main')).toBe('side-a')
  expect(nextResearchSplitColumn(sides, 'side-b')).toBe('main')
  expect(nextResearchSplitColumn(sides, 'gone')).toBe('main')
})

describe('the remembered split', () => {
  const side = {
    id: 'side-a',
    workspaceId: 'repo::/b',
    hostId: 'runtime:gpu',
    page: 'research-writing'
  }

  it('comes back with its sides, widths and main project', () => {
    const raw = JSON.stringify({
      sides: [side],
      weights: [2, 1],
      main: { workspaceId: 'repo::/a', hostId: null }
    })
    expect(parsePersistedResearchSplit(raw)).toEqual({
      sides: [side],
      weights: [2, 1],
      main: { workspaceId: 'repo::/a', hostId: null }
    })
  })

  it('drops damaged entries rather than the whole window layout', () => {
    const raw = JSON.stringify({
      sides: [side, { id: '../x', workspaceId: 'w', hostId: null, page: 'research-chats' }],
      weights: [1, -1, 3],
      main: { workspaceId: 7 }
    })
    expect(parsePersistedResearchSplit(raw)).toEqual({ sides: [side], weights: [1, 1], main: null })
    expect(parsePersistedResearchSplit('{not json')).toEqual({ sides: [], weights: [], main: null })
  })
})
