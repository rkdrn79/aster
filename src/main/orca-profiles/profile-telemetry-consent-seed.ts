import { existsSync } from 'node:fs'
import type { GlobalSettings } from '../../shared/global-settings-types'
import { acquireProfileStateRuntimeAdmission } from '../persistence/profile-state/profile-state-access'
import { isProfileStateSqliteAvailable } from '../persistence/profile-state/profile-state-database'
import { migrateProfileStateToSqlite } from '../persistence/profile-state/profile-state-migration'
import {
  getOrcaProfileDataFile,
  getOrcaProfileStateDatabaseFile,
  getProfileUserDataPath
} from './profile-storage-paths'
import { PRODUCT_NAME } from '../../shared/product-brand'

// Keep the active install's consent and anonymous identity when creating another profile.
export function seedNewOrcaProfileTelemetryConsent(
  profileId: string,
  telemetry: GlobalSettings['telemetry'],
  userDataPath = getProfileUserDataPath()
): void {
  if (!telemetry) {
    return
  }
  if (!isProfileStateSqliteAvailable()) {
    throw new Error(`Creating profile state requires the bundled ${PRODUCT_NAME} runtime.`)
  }
  const admission = acquireProfileStateRuntimeAdmission(userDataPath)
  try {
    const dataFile = getOrcaProfileDataFile(profileId, userDataPath)
    const databaseFile = getOrcaProfileStateDatabaseFile(profileId, userDataPath)
    if (existsSync(dataFile) || existsSync(databaseFile)) {
      return
    }
    const migrated = migrateProfileStateToSqlite({
      dataFile,
      databaseFile,
      profileId,
      expectedLegacyJson: undefined,
      serializedState: JSON.stringify({ settings: { telemetry } })
    })
    migrated.authority.close()
  } finally {
    admission.release()
  }
}
