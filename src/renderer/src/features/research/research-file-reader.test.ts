import { describe, expect, it } from 'vitest'
import { decodeResearchLogTail } from './research-file-reader'

const encode = (text: string): Uint8Array => new TextEncoder().encode(text)

describe('research log tail decoding', () => {
  it('keeps the first complete line when the range starts after a newline', () => {
    expect(decodeResearchLogTail(encode('BOUNDARY_MARKER\nTAIL\n'), 100, 10)).toBe(
      'BOUNDARY_MARKER\nTAIL\n'
    )
  })

  it('drops only a line fragment and preserves the following complete line', () => {
    expect(decodeResearchLogTail(encode('gment\nTAIL_MARKER\n'), 100, 97)).toBe('TAIL_MARKER\n')
  })

  it('keeps a short or single-line tail instead of returning an empty log', () => {
    expect(decodeResearchLogTail(encode('short\n'), 0, null)).toBe('short\n')
    expect(decodeResearchLogTail(encode('long line'), 100, 97)).toBe('long line')
  })
})
