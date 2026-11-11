// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RebuttalReplyProposal } from '../../../../research-harness/research-rebuttal-records.mjs'
import { ResearchRebuttalProposalSlot } from './ResearchRebuttalProposalSlot'

afterEach(cleanup)

const edit: RebuttalReplyProposal = {
  id: 'X1',
  slot: 'C1',
  kind: 'replace',
  applied: true,
  base: 'My words.',
  text: 'Agent words.',
  find: null,
  replace: null,
  turn: 't1',
  request: 'Shorter',
  at: '2026-11-11T00:00:00.000Z'
}

function setup(proposal: RebuttalReplyProposal, editingBase: string | null = null) {
  const actions = {
    acceptProposal: vi.fn(async () => null),
    discardProposal: vi.fn(async () => null)
  }
  render(
    <ResearchRebuttalProposalSlot
      proposal={proposal}
      current={proposal.applied ? proposal.text : proposal.base}
      editingBase={editingBase}
      readOnly={false}
      actions={actions}
    />
  )
  return actions
}

describe('the agent edit under a reply', () => {
  it('is a quiet mark with the changes on demand and a one-click Undo', async () => {
    const actions = setup(edit)
    expect(screen.getByText(/Edited by the agent · Shorter/)).toBeTruthy()
    expect(screen.queryByText('My')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Show changes' }))
    expect(screen.getByText('My').className).toContain('line-through')
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(actions.discardProposal).toHaveBeenCalledWith('X1'))
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss the agent edit note' }))
    await waitFor(() => expect(actions.acceptProposal).toHaveBeenCalledWith('X1'))
  })

  it('a draft into an empty reply has nothing to compare, only Undo', () => {
    setup({ ...edit, base: '' })
    expect(screen.getByText(/Drafted by the agent/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Show changes' })).toBeNull()
  })

  it('is held while the person types over text the agent never saw them change', () => {
    setup(edit, 'My words.')
    expect(screen.getByRole('status', { name: 'Agent edit held while you type' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
  })

  it('is not held when the person is editing on from the agent text', () => {
    setup(edit, 'Agent words.')
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy()
  })

  it('a waiting suggestion is still a card to accept or discard', () => {
    setup({ ...edit, applied: false, heldWhileTyping: true })
    expect(screen.getByText(/written while you were typing/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Accept' })).toBeTruthy()
  })
})
