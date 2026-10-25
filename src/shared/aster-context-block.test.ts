import { describe, expect, it } from 'vitest'
import { asterContextRequestText, splitAsterContext, withAsterContext } from './aster-context-block'

describe('Aster context blocks', () => {
  it('round-trips a request and a context whose body holds longer fences', () => {
    const body = 'Read `run show`.\n````text\nlog line\n````\nThen report.'
    const message = withAsterContext('Diagnose failed Run cosine-lr-2e-3.', {
      label: 'Denoiser samples · 1 run,\n20 log lines',
      body
    })
    expect(message.split('\n')[2]).toBe('`````aster-context Denoiser samples · 1 run, 20 log lines')
    expect(splitAsterContext(message)).toEqual({
      request: 'Diagnose failed Run cosine-lr-2e-3.',
      contexts: [{ label: 'Denoiser samples · 1 run, 20 log lines', body }]
    })
  })

  it('keeps text around several blocks as the request', () => {
    const message = [
      'Before.',
      '```aster-context first',
      'a',
      '```',
      'Between.',
      '```aster-context',
      'b',
      '```'
    ].join('\n')
    expect(splitAsterContext(message)).toEqual({
      request: 'Before.\nBetween.',
      contexts: [
        { label: 'first', body: 'a' },
        { label: '', body: 'b' }
      ]
    })
  })

  it('leaves ordinary code fences and an unterminated block as plain text', () => {
    expect(splitAsterContext('```ts\nconst a = 1\n```')).toBeNull()
    expect(splitAsterContext('Ask.\n```aster-context x\nnever closed')).toBeNull()
    expect(asterContextRequestText('Plain prompt')).toBe('Plain prompt')
  })

  it('does not close a block on a shorter fence inside it', () => {
    const message = '````aster-context x\n```\ninner\n```\n````'
    expect(splitAsterContext(message)?.contexts[0]?.body).toBe('```\ninner\n```')
  })
})
