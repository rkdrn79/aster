import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { ASTER_STABLE_UPDATE_FEED, resolveAsterUpdateFeed } = require('./aster-update-feed.cjs')
const { productBuildDefines } = require('../build-plugins/product-build-defines.cjs')

describe('Aster release feed', () => {
  it('keeps local builds disconnected and normalizes an HTTPS release feed', () => {
    expect(resolveAsterUpdateFeed({})).toBeNull()
    expect(resolveAsterUpdateFeed({ ORCA_MAC_RELEASE: '1' })).toBe(ASTER_STABLE_UPDATE_FEED)
    expect(productBuildDefines({ ORCA_MAC_RELEASE: '1' }).ASTER_UPDATE_FEED_URL).toBe(
      JSON.stringify(ASTER_STABLE_UPDATE_FEED)
    )
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

  it('generates ad hoc release metadata while leaving the in-app install feed unset', () => {
    const configPath = require.resolve('../electron-builder-aster.config.cjs')
    const previous = process.env.ASTER_ADHOC_RELEASE
    try {
      process.env.ASTER_ADHOC_RELEASE = '1'
      delete require.cache[configPath]
      const config = require(configPath)
      expect(config.mac.identity).toBe('-')
      expect(config.mac.hardenedRuntime).toBe(false)
      expect(config.publish).toEqual({ provider: 'generic', url: ASTER_STABLE_UPDATE_FEED })
      expect(productBuildDefines({ ASTER_ADHOC_RELEASE: '1' }).ASTER_UPDATE_FEED_URL).toBe('null')
    } finally {
      if (previous === undefined) {
        delete process.env.ASTER_ADHOC_RELEASE
      } else {
        process.env.ASTER_ADHOC_RELEASE = previous
      }
      delete require.cache[configPath]
    }
  })
})
