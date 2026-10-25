import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as ProductBrandModule from '../shared/product-brand'
import { loadUpdaterModule, warmUpdaterModule } from './updater-test-module-loader'

const { autoUpdaterMock, fetchNewerReleaseTagsMock, moduleFactories, resetUpdaterMocks } =
  await vi.hoisted(async () => (await import('./updater-test-harness')).createUpdaterMocks())

const ASTER_FEED = 'https://updates.example.test/aster/stable'

vi.mock('../shared/product-brand', async (importOriginal) => {
  const actual = await importOriginal<typeof ProductBrandModule>()
  return {
    ...actual,
    PRODUCT_BRAND: {
      ...actual.PRODUCT_BRAND,
      links: { ...actual.PRODUCT_BRAND.links, updateFeed: ASTER_FEED }
    }
  }
})
vi.mock('electron', () => moduleFactories.electron())
vi.mock('electron-updater', () => moduleFactories.electronUpdater())
vi.mock('./electron-updater-loader', () => moduleFactories.electronUpdaterLoader())
vi.mock('./ipc/pty/kill-all', () => moduleFactories.ptyKillAll())
vi.mock('./linux-update-package-type', () => moduleFactories.linuxUpdatePackageType())
vi.mock('./updater-lifecycle-diagnostics', () => moduleFactories.updaterLifecycleDiagnostics())
vi.mock('./updater-changelog', () => moduleFactories.updaterChangelog())
vi.mock('./updater-nudge', () => moduleFactories.updaterNudge())
vi.mock('./update-install-exit-watchdog', () => moduleFactories.updateInstallExitWatchdog())
vi.mock('./updater-prerelease-feed', () => moduleFactories.updaterPrereleaseFeed())
vi.mock('./local-builds/local-build-switch', () => moduleFactories.localBuildSwitch())
vi.mock('./local-builds/local-build-feed-server', () => moduleFactories.localBuildFeedServer())

warmUpdaterModule()

describe('Aster update feed', () => {
  beforeEach(() => resetUpdaterMocks())

  it('checks only its configured feed and offers no upstream release builds', async () => {
    const updater = await loadUpdaterModule()
    updater.setupAutoUpdater(null, { getLastUpdateCheckAt: () => Date.now() })
    updater.checkForUpdatesFromMenu({
      includePrerelease: true,
      channel: 'stable',
      targetTag: 'v9.0.0'
    })

    await vi.waitFor(() => expect(autoUpdaterMock.checkForUpdates).toHaveBeenCalledOnce())
    expect(autoUpdaterMock.setFeedURL).toHaveBeenCalledWith({
      provider: 'generic',
      url: ASTER_FEED
    })
    for (const [feed] of autoUpdaterMock.setFeedURL.mock.calls) {
      expect(feed).toEqual({ provider: 'generic', url: ASTER_FEED })
    }
    expect(fetchNewerReleaseTagsMock).not.toHaveBeenCalled()
    await expect(updater.listAvailableReleaseBuilds('stable')).resolves.toEqual([])
  })
})
