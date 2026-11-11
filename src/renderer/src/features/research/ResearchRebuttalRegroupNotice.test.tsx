// @vitest-environment happy-dom
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RebuttalRegroup } from '../../../../research-harness/research-rebuttal-regroup.mjs'

const hold = vi.hoisted(() => ({ holdRebuttalRegroup: vi.fn(async () => undefined) }))
vi.mock('./research-rebuttal-regroup-mutations', () => hold)

import { ResearchRebuttalRegroupNotice } from './ResearchRebuttalRegroupNotice'
import { setRebuttalFieldDirty } from './research-rebuttal-editing'
import { useRebuttalShownSnapshot } from './use-rebuttal-regroup-hold'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  setRebuttalFieldDirty('field', false)
})

const group = (id: string, points: string[], response: string) => ({
  id,
  title: `Group ${id}`,
  points,
  action: 'clarify' as const,
  status: 'drafting' as const,
  plan: '',
  experiment: null,
  manuscript: null,
  response,
  author: 'human' as const,
  general: false
})

const merge: RebuttalRegroup = {
  id: 'G1',
  at: '',
  turn: null,
  request: 'Merge duplicates',
  applied: true,
  summary: {
    merged: [{ into: 'C1', from: ['C2'], joined: true }],
    split: [],
    removed: [],
    moved: []
  },
  affected: ['C1', 'C2'],
  before: {
    clusters: [group('C1', ['R1-W1'], 'Mine.'), group('C2', ['R2-W1'], 'Theirs.')],
    points: null,
    promises: [],
    paperChanges: [],
    predictions: [],
    proposals: [],
    translations: []
  },
  after: { clusters: [group('C1', ['R1-W1', 'R2-W1'], 'Mine.\n\nTheirs.')], points: null },
  input: { clusters: [] },
  supplied: {}
}

function actions() {
  return {
    undoRegroup: vi.fn(async () => null),
    acceptRegroup: vi.fn(async () => null),
    forgetRegroup: vi.fn(async () => null),
    restoreArchivedGroup: vi.fn(async () => null)
  }
}

describe('a regroup on the page', () => {
  it('is a quiet notice with what changed, where replies went, and one Undo', async () => {
    const calls = actions()
    render(
      <ResearchRebuttalRegroupNotice record={merge} archive={[]} readOnly={false} actions={calls} />
    )
    expect(
      screen.getByText(/The agent merged C2 into C1 \(replies joined\) · Merge duplicates/)
    ).toBeTruthy()
    expect(screen.queryByText('Before')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Show changes' }))
    expect(screen.getByText('Before')).toBeTruthy()
    expect(screen.getByText(/C2’s reply → joined into C1/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(calls.undoRegroup).toHaveBeenCalledWith('G1'))
  })

  it('waiting, it is a card to accept or discard, showing the groups before and after', async () => {
    const calls = actions()
    render(
      <ResearchRebuttalRegroupNotice
        record={{ ...merge, applied: false, heldWhileTyping: true }}
        archive={[]}
        readOnly={false}
        actions={calls}
      />
    )
    expect(screen.getByRole('region', { name: 'Regroup concerns' })).toBeTruthy()
    expect(screen.getByText(/written while you were typing/)).toBeTruthy()
    expect(screen.getByText('After')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
    await waitFor(() => expect(calls.acceptRegroup).toHaveBeenCalledWith('G1'))
  })
})

describe('never moving text that is being typed', () => {
  const owner = { hostId: 'local', workspaceId: 'ws', workspacePath: '/p' }
  const snap = (regroups: RebuttalRegroup[]) => ({ regroups })

  it('keeps showing the old groups and holds a regroup that lands in a reply being typed in', async () => {
    const first = snap([])
    const { result, rerender } = renderHook(({ value }) => useRebuttalShownSnapshot(owner, value), {
      initialProps: { value: first }
    })
    act(() => setRebuttalFieldDirty('field', true, 'C2'))
    rerender({ value: snap([merge]) })
    expect(result.current).toBe(first)
    await waitFor(() => expect(hold.holdRebuttalRegroup).toHaveBeenCalledWith(owner, 'G1'))
  })

  it('shows a regroup at once when nothing affected is being typed', () => {
    const { result, rerender } = renderHook(({ value }) => useRebuttalShownSnapshot(owner, value), {
      initialProps: { value: snap([]) }
    })
    act(() => setRebuttalFieldDirty('field', true, 'C7'))
    const next = snap([merge])
    rerender({ value: next })
    expect(result.current).toBe(next)
    expect(hold.holdRebuttalRegroup).not.toHaveBeenCalled()
  })
})
