import { hasReachedAppVersion } from './app-version'
import { CLI_NAME, PRODUCT_NAME } from './product-brand'

// v1.4.214 is the first stable release containing the SQLite profile cutover.
export const SQLITE_PROFILE_RELEASE_FLOOR = '1.4.214'

export function profileStateBuildCompatibilityError(
  currentVersion: string,
  targetVersion: string
): string | null {
  if (
    !hasReachedAppVersion(currentVersion, SQLITE_PROFILE_RELEASE_FLOOR) ||
    hasReachedAppVersion(targetVersion, SQLITE_PROFILE_RELEASE_FLOOR)
  ) {
    return null
  }
  return `This build predates SQLite profile storage. Quit ${PRODUCT_NAME} and run the current CLI’s “${CLI_NAME} profile state rollback --latest-json --profile-id <id>” for each profile before installing it manually.`
}
