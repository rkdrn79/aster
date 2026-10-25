import { describe, expect, it, vi } from 'vitest'
import type { ManuscriptSelection } from '@/components/editor/manuscript-selection-revision'
import { sendWritingAgentRevision } from './research-writing-agent-send'

const selection: ManuscriptSelection = {
  filePath: '/research/paper/main.tex',
  relativePath: 'paper/main.tex',
  startLine: 10,
  startColumn: 1,
  endLine: 12,
  endColumn: 3,
  selectedText: '\\section{Result}\nWe find an improvement.'
}

describe('Writing agent revision send', () => {
  it('sends a bounded quoted proposal request only to the bound structured chat', async () => {
    const send = vi.fn().mockResolvedValue({ status: 'sent' })
    await expect(
      sendWritingAgentRevision({
        worktreeId: 'workspace-1',
        binding: { sessionId: 'writing-session', tabId: 'chat-tab' },
        selection,
        instruction: 'Make the claim precise.',
        send
      })
    ).resolves.toEqual({ status: 'sent' })
    expect(send).toHaveBeenCalledOnce()
    expect(send).toHaveBeenCalledWith({
      worktreeId: 'workspace-1',
      target: { kind: 'structured-session', sessionId: 'writing-session' },
      prompt: expect.stringContaining('Make the claim precise.')
    })
    expect(send.mock.calls[0][0].prompt).toContain(selection.selectedText)
    expect(send.mock.calls[0][0].prompt).toContain('replace only that passage')
    expect(send.mock.calls[0][0].prompt).toContain('save the .tex file')
    expect(send.mock.calls[0][0].prompt).toContain('If it does not match, stop without editing')
  })

  it.each(['not-ready', 'not-writable', 'unconfirmed'] as const)(
    'returns %s to the composer without silently retrying',
    async (status) => {
      const send = vi.fn().mockResolvedValue({ status })
      await expect(
        sendWritingAgentRevision({
          worktreeId: 'workspace-1',
          binding: { sessionId: 'writing-session', tabId: 'chat-tab' },
          selection,
          instruction: 'Revise this.',
          send
        })
      ).resolves.toEqual({ status })
      expect(send).toHaveBeenCalledOnce()
    }
  )

  it('does not send without an instruction or a bounded source selection', async () => {
    const send = vi.fn()
    const args = {
      worktreeId: 'workspace-1',
      binding: { sessionId: 'writing-session', tabId: 'chat-tab' },
      selection,
      send
    }
    expect((await sendWritingAgentRevision({ ...args, instruction: ' ' })).status).toBe('invalid')
    expect(
      (
        await sendWritingAgentRevision({
          ...args,
          instruction: 'Revise.',
          selection: { ...selection, selectedText: 'x'.repeat(24_001) }
        })
      ).status
    ).toBe('invalid')
    expect(send).not.toHaveBeenCalled()
  })
})
