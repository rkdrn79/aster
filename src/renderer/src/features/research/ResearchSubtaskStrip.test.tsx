// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { emptyResearchDocument } from '../../../../shared/research/research-records'
import { useResearchRecords } from './research-records-store'
import { withResearchChatBranch } from './research-chat-branches'

vi.mock('./ResearchChatStatusBadge', () => ({ useResearchChatLiveStatus: () => 'working' }))
vi.mock('@/components/native-chat/NativeChatView', () => ({ default: () => null }))

const { ResearchSubtaskStrip, useResearchSubtaskInspection } =
  await import('./ResearchSubtaskStrip')

afterEach(cleanup)

const SCOPE = { hostId: 'local', workspaceId: 'ws-1' }
const base = { parentSessionId: 'chat-1', messageNumber: 4, createdAt: '2026-11-13T00:00:00Z' }

function seed() {
  let document = emptyResearchDocument()
  document = withResearchChatBranch(document, SCOPE, 'running', {
    ...base,
    kind: 'subtask',
    task: 'Check the table'
  })
  document = withResearchChatBranch(document, SCOPE, 'waiting', {
    ...base,
    kind: 'subtask',
    task: 'Read the log',
    finishedAt: 't1',
    resultPreview: 'The run diverged at step 400.'
  })
  document = withResearchChatBranch(document, SCOPE, 'delivered', {
    ...base,
    kind: 'subtask',
    task: 'Sum the costs',
    finishedAt: 't1',
    deliveredAt: 't2'
  })
  document = withResearchChatBranch(document, SCOPE, 'dismissed', {
    ...base,
    kind: 'subtask',
    task: 'Old one',
    finishedAt: 't1',
    dismissedAt: 't3'
  })
  useResearchRecords.setState({ document })
}

describe('a chat’s subtasks', () => {
  it('shows a running chip, then a result card saying whether the agent has it', () => {
    seed()
    render(
      <ResearchSubtaskStrip sessionId="chat-1" target={{ kind: 'local' }} workspaceId="ws-1" />
    )
    expect(screen.getByRole('button', { name: 'Subtask: Check the table · running' })).toBeVisible()
    const cards = screen.getAllByRole('region', { name: 'Subtask result' })
    expect(cards).toHaveLength(2)
    expect(cards[0]).toHaveTextContent('Subtask result · Read the log')
    expect(cards[0]).toHaveTextContent('The run diverged at step 400.')
    expect(cards[0]).toHaveTextContent('Goes to the agent here once it finishes its current turn')
    // Handed over, the card is one quiet line: the chat itself now shows the result.
    expect(cards[1]).toHaveTextContent('Subtask result · Sum the costsHanded to the agent')
    expect(cards[1]).not.toHaveTextContent('Goes to the agent')
    expect(screen.queryByText(/Old one/)).toBeNull()
  })

  it('opens the subtask’s own chat from the chip', () => {
    seed()
    render(
      <ResearchSubtaskStrip sessionId="chat-1" target={{ kind: 'local' }} workspaceId="ws-1" />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Subtask: Check the table · running' }))
    expect(useResearchSubtaskInspection.getState().open).toMatchObject({
      sessionId: 'running',
      scope: SCOPE
    })
  })

  it('draws nothing for a chat with no subtasks', () => {
    seed()
    const { container } = render(
      <ResearchSubtaskStrip sessionId="other" target={{ kind: 'local' }} workspaceId="ws-1" />
    )
    expect(container).toBeEmptyDOMElement()
  })
})
