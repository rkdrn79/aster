import type { BrowserWindow } from 'electron'
import type {
  LinuxPackageInstallInstructions,
  UpdateCheckOptions,
  UpdateStatus
} from '../shared/update-status-types'
import type {
  RemoteServerUpdateInstallResult,
  RemoteServerUpdaterSnapshot,
  RemoteServerUpdateSupport
} from '../shared/remote-server-update'
import type { ReleaseBuild, ReleaseChannel } from '../shared/release-channel'
import type { ReleaseBuildListOptions } from './updater-release-build-cache'
import { UpdaterSetup, type UpdaterSetupOptions } from './updater/updater-setup'
import type { PreQuitCleanupFailureMode, UpdateInstallMode } from './updater/updater-state'
import { isUpstreamProduct, PRODUCT_BRAND, PRODUCT_NAME } from '../shared/product-brand'
import {
  checkForManualUpdate,
  getManualUpdateStatus,
  openManualUpdateDownload,
  setupManualUpdateChecks
} from './aster-manual-updates'

// Keep one service instance so all public API calls share updater state and event listeners.
const updater = new UpdaterSetup()
const unconfiguredUpdateSupport: RemoteServerUpdateSupport = {
  installMode: 'unsupported-headless-serve',
  automatic: false,
  reason: 'updater-unavailable'
}

// Why: a build without its own release feed must never fetch or install another product's updates.
function isUpdateFeedUnconfigured(): boolean {
  return PRODUCT_BRAND.links.updateFeed === null
}

const UPDATE_FEED_UNCONFIGURED_ERROR = `${PRODUCT_NAME} update channel is not configured.`

export type { PreQuitCleanupFailureMode, UpdateInstallMode, UpdaterSetupOptions }

export function resolveUpdateInstallMode(isServeMode: boolean): UpdateInstallMode {
  return updater.resolveUpdateInstallMode(isServeMode)
}

export function getUpdateStatus(): UpdateStatus {
  if (isUpdateFeedUnconfigured() && !isUpstreamProduct()) {
    return getManualUpdateStatus()
  }
  return updater.getUpdateStatus()
}

export function getRemoteServerUpdateSupport(): RemoteServerUpdateSupport {
  if (isUpdateFeedUnconfigured()) {
    return unconfiguredUpdateSupport
  }
  return updater.getRemoteServerUpdateSupport()
}

export function getRemoteServerUpdaterSnapshot(runtimeId: string): RemoteServerUpdaterSnapshot {
  if (isUpdateFeedUnconfigured()) {
    return {
      ...updater.getRemoteServerUpdaterSnapshot(runtimeId),
      support: unconfiguredUpdateSupport
    }
  }
  return updater.getRemoteServerUpdaterSnapshot(runtimeId)
}

export function checkForRemoteServerUpdate(
  runtimeId: string,
  options?: UpdateCheckOptions
): RemoteServerUpdaterSnapshot {
  if (isUpdateFeedUnconfigured()) {
    throw new Error(UPDATE_FEED_UNCONFIGURED_ERROR)
  }
  return updater.checkForRemoteServerUpdate(runtimeId, options)
}

export function downloadRemoteServerUpdate(runtimeId: string): RemoteServerUpdaterSnapshot {
  if (isUpdateFeedUnconfigured()) {
    throw new Error(UPDATE_FEED_UNCONFIGURED_ERROR)
  }
  return updater.downloadRemoteServerUpdate(runtimeId)
}

export function installRemoteServerUpdate(runtimeId: string): RemoteServerUpdateInstallResult {
  if (isUpdateFeedUnconfigured()) {
    throw new Error(UPDATE_FEED_UNCONFIGURED_ERROR)
  }
  return updater.installRemoteServerUpdate(runtimeId)
}

export function checkForUpdates(): void {
  if (isUpdateFeedUnconfigured()) {
    if (!isUpstreamProduct()) {
      void checkForManualUpdate()
    }
    return
  }
  updater.checkForUpdates()
}

export function checkForUpdatesFromMenu(options?: UpdateCheckOptions): void {
  if (isUpdateFeedUnconfigured()) {
    if (!isUpstreamProduct()) {
      void checkForManualUpdate(true)
    }
    return
  }
  updater.checkForUpdatesFromMenu(
    isUpstreamProduct() ? options : options?.localBuild ? { localBuild: true } : undefined
  )
}

export function downloadUpdate(): void | Promise<void> {
  if (isUpdateFeedUnconfigured()) {
    if (!isUpstreamProduct()) {
      return openManualUpdateDownload()
    }
    return
  }
  updater.downloadUpdate()
}

export function quitAndInstall(): void {
  if (isUpdateFeedUnconfigured()) {
    return
  }
  updater.quitAndInstall()
}

export function isQuittingForUpdate(): boolean {
  return updater.isQuittingForUpdate()
}

export async function getLinuxPackageInstallInstructions(): Promise<LinuxPackageInstallInstructions> {
  return updater.getLinuxPackageInstallInstructions()
}

export async function showLinuxPackage(): Promise<void> {
  return updater.showLinuxPackage()
}

export async function listAvailableReleaseBuilds(
  channel: ReleaseChannel,
  options?: ReleaseBuildListOptions
): Promise<ReleaseBuild[]> {
  if (isUpdateFeedUnconfigured() || !isUpstreamProduct()) {
    return []
  }
  return updater.listAvailableReleaseBuilds(channel, options)
}

export function dismissNudge(): void {
  updater.dismissNudge()
}

export function dismissAvailableUpdate(): void {
  updater.dismissAvailableUpdate()
}

export function setupAutoUpdater(
  mainWindow: BrowserWindow | null,
  opts?: UpdaterSetupOptions
): void {
  if (isUpdateFeedUnconfigured()) {
    if (!isUpstreamProduct()) {
      setupManualUpdateChecks(mainWindow)
    }
    return
  }
  updater.setupAutoUpdater(mainWindow, opts)
}
