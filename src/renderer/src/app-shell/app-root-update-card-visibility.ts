import type { UpdateStatus } from '../../../shared/update-status-types'

export function shouldMountUpdateCardForStatus(status: UpdateStatus, enabled: boolean): boolean {
  if (!enabled || status.state === 'idle') {
    return false
  }
  if (status.state === 'checking' || status.state === 'not-available') {
    return status.userInitiated === true
  }
  return true
}
