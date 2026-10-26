import { describe, expect, it, vi } from 'vitest'
import { availableManualUpdate } from './aster-manual-updates'

vi.mock('electron', () => ({ app: {}, net: {}, shell: {} }))

const release = {
  tag_name: 'v0.1.1',
  draft: false,
  prerelease: false,
  assets: [{ name: 'Aster-mac-arm64.dmg' }]
}

describe('Aster manual release notification', () => {
  it('opens the exact DMG from a newer published release', () => {
    expect(availableManualUpdate(release, '0.1.0')).toEqual({
      state: 'available',
      version: '0.1.1',
      releaseUrl: 'https://github.com/rkdrn79/aster/releases/tag/v0.1.1',
      manualDownloadUrl:
        'https://github.com/rkdrn79/aster/releases/download/v0.1.1/Aster-mac-arm64.dmg',
      changelog: null
    })
  })

  it('ignores unchanged, incomplete, and unpublished releases', () => {
    expect(availableManualUpdate(release, '0.1.1')).toBeNull()
    expect(availableManualUpdate({ ...release, draft: true }, '0.1.0')).toBeNull()
    expect(availableManualUpdate({ ...release, prerelease: true }, '0.1.0')).toBeNull()
    expect(availableManualUpdate({ ...release, assets: [] }, '0.1.0')).toBeNull()
    expect(availableManualUpdate({ ...release, tag_name: 'v0.1.2/other' }, '0.1.0')).toBeNull()
  })
})
