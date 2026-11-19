// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const summaries = vi.hoisted(
  (): Record<string, { status: string | null; turnOutcome?: string } | null> => ({
    working: { status: 'working' },
    asking: { status: 'attention' },
    done: { status: 'idle', turnOutcome: 'completed' },
    waiting: { status: 'idle' },
    quiet: null
  })
)
vi.mock('@/components/native-chat/StructuredAgentSessionStatusBridge', () => ({
  useStructuredAgentSessionStatusSummary: (sessionId: string) => ({
    summary: summaries[sessionId] ? { sessionId, ...summaries[sessionId] } : null,
    observation: 'live'
  })
}))

const { ResearchChatStatusBadge } = await import('./ResearchChatStatusBadge')

afterEach(cleanup)

describe("a fork's live status", () => {
  it('says working, needs you or done, and nothing while it waits for a prompt', () => {
    for (const [id, words] of [
      ['working', 'Working'],
      ['asking', 'Needs you'],
      ['done', 'Done']
    ] as const) {
      const { container } = render(<ResearchChatStatusBadge sessionId={id} hostId="local" />)
      expect(container).toHaveTextContent(words)
      cleanup()
    }
    for (const id of ['waiting', 'quiet']) {
      const { container } = render(<ResearchChatStatusBadge sessionId={id} hostId="local" />)
      expect(container).toBeEmptyDOMElement()
      cleanup()
    }
  })

  it('keeps only its mark in a narrow list, the words for screen readers and its tooltip', () => {
    render(<ResearchChatStatusBadge sessionId="done" hostId="local" compact />)
    const badge = screen.getByTitle('Done')
    expect(badge).toHaveAttribute('data-research-chat-status', 'done')
    expect(screen.getByText('Done')).toHaveClass('sr-only')
  })
})
