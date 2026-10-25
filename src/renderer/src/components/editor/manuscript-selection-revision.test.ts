import { beforeEach, describe, expect, it, vi } from 'vitest'

const { appendDraft } = vi.hoisted(() => ({ appendDraft: vi.fn(() => true) }))
vi.mock('@/components/native-chat/native-chat-draft-cache', () => ({
  appendNativeChatDraftCache: appendDraft
}))
vi.mock('@/components/native-chat/native-chat-composer-draft-store', () => ({
  structuredAgentSessionDraftScopeKey: (sessionId: string) => `agent-session:${sessionId}`
}))

import {
  appendManuscriptRevisionToAgentDraft,
  buildManuscriptRevisionPrompt,
  type ManuscriptSelection
} from './manuscript-selection-revision'

const selection: ManuscriptSelection = {
  filePath: '/research/paper/main.tex',
  relativePath: 'paper/main.tex',
  startLine: 42,
  startColumn: 3,
  endLine: 45,
  endColumn: 9,
  selectedText: 'We find a ````difficult result.\n\\cite{smith2026}'
}

describe('manuscript revision draft', () => {
  beforeEach(() => appendDraft.mockClear())

  it('preserves the exact source and asks for a proposal without editing files', () => {
    const prompt = buildManuscriptRevisionPrompt(selection, 'Improve the claim.')
    expect(prompt).toContain('paper/main.tex')
    expect(prompt).toContain('42:3–45:9')
    expect(prompt).toContain(`\`\`\`\`\`latex\n${selection.selectedText}\n\`\`\`\`\``)
    expect(prompt).toContain('Do not edit files or apply the replacement')
  })

  it('adds only to the explicitly chosen structured chat draft', () => {
    expect(
      appendManuscriptRevisionToAgentDraft({
        selection,
        instruction: 'Tighten the result.',
        sessionId: 'selected-session'
      })
    ).toBe(true)
    expect(appendDraft).toHaveBeenCalledOnce()
    expect(appendDraft).toHaveBeenCalledWith(
      'agent-session:selected-session',
      expect.stringContaining('Tighten the result.')
    )
  })
})
