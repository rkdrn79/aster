import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadUpdaterModule, warmUpdaterModule } from './updater-test-module-loader'

const { autoUpdaterMock, moduleFactories, resetUpdaterMocks } = await vi.hoisted(async () =>
  (await import('./updater-test-harness')).createUpdaterMocks()
)

vi.mock('../shared/product-brand', async (importOriginal) =>
  (await import('./updater-test-product-brand')).productBrandWithoutUpdateFeed(importOriginal)
)
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

describe('updater without a release feed of its own', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    resetUpdaterMocks()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('never reaches electron-updater or the release API from a packaged build', async () => {
    const updater = await loadUpdaterModule()

    updater.setupAutoUpdater(null)
    updater.checkForUpdates()
    updater.checkForUpdatesFromMenu({ includePrerelease: true })
    updater.downloadUpdate()
    updater.quitAndInstall()

    await expect(updater.listAvailableReleaseBuilds('hourly')).resolves.toEqual([])
    expect(autoUpdaterMock.setFeedURL).not.toHaveBeenCalled()
    expect(autoUpdaterMock.on).not.toHaveBeenCalled()
    expect(autoUpdaterMock.checkForUpdates).not.toHaveBeenCalled()
    expect(autoUpdaterMock.downloadUpdate).not.toHaveBeenCalled()
    expect(autoUpdaterMock.quitAndInstall).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('tells remote servers the updater is unavailable instead of checking', async () => {
    const updater = await loadUpdaterModule()

    expect(updater.getRemoteServerUpdateSupport()).toEqual({
      installMode: 'unsupported-headless-serve',
      automatic: false,
      reason: 'updater-unavailable'
    })
    expect(updater.getRemoteServerUpdaterSnapshot('runtime-1').support).toEqual(
      updater.getRemoteServerUpdateSupport()
    )
    expect(() => updater.checkForRemoteServerUpdate('runtime-1')).toThrow(
      'update channel is not configured'
    )
    expect(() => updater.downloadRemoteServerUpdate('runtime-1')).toThrow(
      'update channel is not configured'
    )
    expect(() => updater.installRemoteServerUpdate('runtime-1')).toThrow(
      'update channel is not configured'
    )
  })
})
