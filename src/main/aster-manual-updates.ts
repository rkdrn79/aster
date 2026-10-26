import { app, net, shell } from 'electron'
import type { BrowserWindow } from 'electron'
import { compareAppVersions, isValidAppVersion } from '../shared/app-version'
import type { UpdateStatus } from '../shared/update-status-types'

const RELEASE_API = 'https://api.github.com/repos/rkdrn79/aster/releases/latest'
const RELEASE_BASE = 'https://github.com/rkdrn79/aster/releases'
const DMG_NAME = 'Aster-mac-arm64.dmg'
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000

type LatestRelease = {
  tag_name?: unknown
  draft?: unknown
  prerelease?: unknown
  assets?: unknown
}

export function availableManualUpdate(
  release: LatestRelease | null,
  installedVersion: string
): Extract<UpdateStatus, { state: 'available' }> | null {
  const tag = release?.tag_name
  if (
    typeof tag !== 'string' ||
    !/^v\d+\.\d+\.\d+$/.test(tag) ||
    release?.draft === true ||
    release?.prerelease === true ||
    !isValidAppVersion(installedVersion) ||
    compareAppVersions(tag, installedVersion) <= 0 ||
    !Array.isArray(release?.assets) ||
    !release.assets.some((asset) => asset?.name === DMG_NAME)
  ) {
    return null
  }
  return {
    state: 'available',
    version: tag.slice(1),
    releaseUrl: `${RELEASE_BASE}/tag/${tag}`,
    manualDownloadUrl: `${RELEASE_BASE}/download/${tag}/${DMG_NAME}`,
    changelog: null
  }
}

let status: UpdateStatus = { state: 'idle' }
let mainWindow: BrowserWindow | null = null
let checkTimer: ReturnType<typeof setInterval> | null = null
let checking = false

function sendStatus(next: UpdateStatus): void {
  status = next
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updater:status', next)
  }
}

export function getManualUpdateStatus(): UpdateStatus {
  return status
}

export async function checkForManualUpdate(userInitiated = false): Promise<void> {
  if (!app.isPackaged || process.platform !== 'darwin' || process.arch !== 'arm64' || checking) {
    return
  }
  checking = true
  if (userInitiated) {
    sendStatus({ state: 'checking', userInitiated: true })
  }
  try {
    const response = await net.fetch(RELEASE_API, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': `Aster/${app.getVersion()}` },
      signal: AbortSignal.timeout(8000)
    })
    if (!response.ok) {
      throw new Error(`GitHub release check failed (HTTP ${response.status}).`)
    }
    const release: LatestRelease = await response.json()
    const available = availableManualUpdate(release, app.getVersion())
    sendStatus(available ?? { state: 'not-available', userInitiated })
  } catch (error) {
    if (userInitiated) {
      sendStatus({
        state: 'error',
        message: error instanceof Error ? error.message : String(error),
        userInitiated: true
      })
    } else {
      console.warn('[aster-updates] release check failed:', error)
    }
  } finally {
    checking = false
  }
}

export function setupManualUpdateChecks(window: BrowserWindow | null): void {
  if (!window || !app.isPackaged || process.platform !== 'darwin' || process.arch !== 'arm64') {
    return
  }
  mainWindow = window
  if (status.state !== 'idle') {
    sendStatus(status)
  }
  if (checkTimer) {
    return
  }
  void checkForManualUpdate()
  checkTimer = setInterval(() => void checkForManualUpdate(), CHECK_INTERVAL_MS)
  checkTimer.unref?.()
}

export async function openManualUpdateDownload(): Promise<void> {
  if (status.state !== 'available' || !status.manualDownloadUrl) {
    return
  }
  await shell.openExternal(status.manualDownloadUrl)
}
