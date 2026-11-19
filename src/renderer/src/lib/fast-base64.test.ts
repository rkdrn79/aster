import { describe, expect, it } from 'vitest'
import { decodeBase64Bytes, encodeBase64Bytes } from './fast-base64'

describe('fast base64', () => {
  it('round-trips every byte value and odd lengths', () => {
    const bytes = Uint8Array.from({ length: 70_001 }, (_, index) => (index * 31) % 256)
    const encoded = encodeBase64Bytes(bytes)
    expect(encoded).toBe(Buffer.from(bytes).toString('base64'))
    expect(decodeBase64Bytes(encoded)).toEqual(bytes)
  })

  it('handles empty input and rejects text that is not base64', () => {
    expect(decodeBase64Bytes('')).toEqual(new Uint8Array())
    expect(encodeBase64Bytes(new Uint8Array())).toBe('')
    expect(() => decodeBase64Bytes('%%%')).toThrow()
  })
})
