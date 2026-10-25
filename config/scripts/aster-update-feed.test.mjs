import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const { resolveAsterUpdateFeed } = createRequire(import.meta.url)('./aster-update-feed.cjs')
const { productBuildDefines } = createRequire(import.meta.url)(
  '../build-plugins/product-build-defines.cjs'
)

describe('Aster release feed', () => {
  it('keeps local builds disconnected and normalizes an HTTPS release feed', () => {
    expect(resolveAsterUpdateFeed({})).toBeNull()
    expect(
      resolveAsterUpdateFeed({ ASTER_UPDATE_FEED_URL: ' https://updates.example.test/aster/ ' })
    ).toBe('https://updates.example.test/aster')
    expect(
      productBuildDefines({ ASTER_UPDATE_FEED_URL: 'https://updates.example.test/aster/' })
        .ASTER_UPDATE_FEED_URL
    ).toBe('"https://updates.example.test/aster"')
  })

  it.each([
    'http://updates.example.test/aster',
    'https://user:secret@updates.example.test/aster',
    'https://updates.example.test/aster?token=secret',
    'https://updates.example.test/aster#release',
    'not-a-url'
  ])('rejects an unsafe or invalid update address: %s', (value) => {
    expect(() => resolveAsterUpdateFeed({ ASTER_UPDATE_FEED_URL: value })).toThrow()
  })
})
