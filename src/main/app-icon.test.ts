import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createFromPath, setDockIcon, setWindowIcon } = vi.hoisted(() => ({
  createFromPath: vi.fn(),
  setDockIcon: vi.fn(),
  setWindowIcon: vi.fn()
}))

vi.mock('electron', () => ({
  app: { isPackaged: false, dock: { setIcon: setDockIcon } },
  BrowserWindow: {
    getAllWindows: () => [{ isDestroyed: () => false, setIcon: setWindowIcon }]
  },
  nativeImage: { createFromPath }
}))

vi.mock('../../resources/build/aster.png?asset', () => ({ default: 'aster-icon' }))
vi.mock('../../resources/build/aster.png?asset&asarUnpack', () => ({
  default: 'aster-icon-unpacked'
}))

import { applyAppIcon, getAppIconPath } from './app-icon'

describe('Aster app icon', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses the Aster icon for current and legacy saved selections', () => {
    for (const id of ['classic', 'watercolor', 'blue', 'missing']) {
      expect(getAppIconPath(id)).toBe('aster-icon')
    }
  })

  it('applies the Aster icon to the Dock and live windows', () => {
    const image = { isEmpty: () => false }
    createFromPath.mockReturnValue(image)

    applyAppIcon('blue')

    expect(createFromPath).toHaveBeenCalledWith('aster-icon')
    if (process.platform === 'darwin') {
      expect(setDockIcon).toHaveBeenCalledWith(image)
    }
    expect(setWindowIcon).toHaveBeenCalledWith(image)
  })
})
