import { describe, expect, it } from 'vitest'
import { withAsterContext } from '../../../../shared/aster-context-block'
import { researchChatTitle, researchChatTitleFromPrompt } from './research-chat-label'

describe('research chat titles', () => {
  it('names a chat by its parts, clipping each one alone', () => {
    expect(researchChatTitle('Denoiser samples', 'agent')).toBe('Denoiser samples · agent')
    const long = researchChatTitle('x'.repeat(80), 'agent')
    expect(long.endsWith('… · agent')).toBe(true)
    expect(researchChatTitle('', 'Writing agent')).toBe('Writing agent')
  })

  it('takes a reading chat title from the context label, never the prompt text', () => {
    const prompt = withAsterContext('Summarize this paper.', {
      label: 'Attention Is All You Need',
      body: 'PDF: "/private/var/folders/x/paper.pdf"'
    })
    expect(researchChatTitleFromPrompt(prompt, 'Reading', 'Reading agent')).toBe(
      'Reading · Attention Is All You Need'
    )
    expect(researchChatTitleFromPrompt('Plain question', 'Reading', 'Reading agent')).toBe(
      'Reading agent'
    )
    expect(researchChatTitleFromPrompt(undefined, 'Reading', 'Reading agent')).toBe('Reading agent')
  })
})
