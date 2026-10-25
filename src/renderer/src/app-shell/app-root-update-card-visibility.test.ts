import { describe, expect, it } from 'vitest'
import { shouldMountUpdateCardForStatus } from './app-root-update-card-visibility'

describe('update card visibility', () => {
  it('shows an available release in an Aster build with an update feed', () => {
    expect(
      shouldMountUpdateCardForStatus(
        { state: 'available', version: '1.4.216', changelog: null },
        true
      )
    ).toBe(true)
  })

  it('keeps local Aster builds without a feed quiet', () => {
    expect(
      shouldMountUpdateCardForStatus(
        { state: 'available', version: '1.4.216', changelog: null },
        false
      )
    ).toBe(false)
  })

  it('shows manual check feedback but not background idle checks', () => {
    expect(shouldMountUpdateCardForStatus({ state: 'checking', userInitiated: true }, true)).toBe(
      true
    )
    expect(shouldMountUpdateCardForStatus({ state: 'checking' }, true)).toBe(false)
    expect(shouldMountUpdateCardForStatus({ state: 'idle' }, true)).toBe(false)
  })
})
