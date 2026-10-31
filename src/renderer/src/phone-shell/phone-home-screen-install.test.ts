import { describe, expect, it } from 'vitest'
import { homeScreenPlatform, homeScreenSteps } from './phone-home-screen-install'

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

describe('home screen install steps', () => {
  it('tells iOS browsers apart, including iPadOS reporting a Mac', () => {
    expect(homeScreenPlatform(IPHONE_SAFARI, 5)).toBe('ios-safari')
    expect(homeScreenPlatform(IPHONE_SAFARI.replace('Version/17.0', 'CriOS/120.0'), 5)).toBe(
      'ios-other'
    )
    expect(homeScreenPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe(
      'ios-safari'
    )
    expect(homeScreenPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe('other')
    expect(homeScreenPlatform('Mozilla/5.0 (Linux; Android 14; Pixel 8)', 5)).toBe('android')
  })

  it('asks for the link only when there is one to copy', () => {
    expect(homeScreenSteps('ios-safari', { canPrompt: false, hasLink: true })).toHaveLength(3)
    expect(homeScreenSteps('ios-safari', { canPrompt: false, hasLink: false })).toEqual([
      'Tap Share in Safari’s toolbar, then Add to Home Screen.'
    ])
    expect(homeScreenSteps('android', { canPrompt: true, hasLink: true })[0]).toBe(
      'Tap Install Aster.'
    )
  })
})
