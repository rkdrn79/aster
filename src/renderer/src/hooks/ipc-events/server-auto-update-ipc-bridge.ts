import { isWebClientLocation } from '@/lib/web-client-location'
import { useAppStore } from '../../store'

/**
 * Mirrors the desktop's per-server automatic-update state into the store: one read at startup,
 * then every broadcast. Desktop only; the web client has no managed servers to update.
 */
export function registerServerAutoUpdateIpcBridge(unsubs: (() => void)[]): void {
  const api = isWebClientLocation() ? undefined : window.api?.runtimeEnvironments?.managedOrcad
  if (!api?.onAutoUpdateChanged || !api.autoUpdateStatus) {
    return
  }
  let initialReadPending = true
  let receivedPushBeforeInitialRead = false
  unsubs.push(
    api.onAutoUpdateChanged((statuses) => {
      if (initialReadPending) {
        receivedPushBeforeInitialRead = true
      }
      useAppStore.getState().setServerAutoUpdateStatuses(statuses)
    })
  )
  // Why: a push that lands while the first read is in flight is newer than the read.
  void api.autoUpdateStatus().then(
    (statuses) => {
      initialReadPending = false
      if (!receivedPushBeforeInitialRead) {
        useAppStore.getState().setServerAutoUpdateStatuses(statuses)
      }
    },
    () => {
      initialReadPending = false
    }
  )
}
