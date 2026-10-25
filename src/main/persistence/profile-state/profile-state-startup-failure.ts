import { profileStateSectionLabels } from './profile-state-section-labels'
import { CLI_NAME, PRODUCT_NAME } from '../../../shared/product-brand'

type ProfileStateRecoveryFailure = {
  code: 'profile-state-recovery-required'
  dataFile: string
  databaseFile: string
  exportPaths: readonly string[]
  backupPaths?: readonly string[]
  profileId?: unknown
  repairableSections?: unknown
}

type ProfileStateAuthorityFailure = {
  code: 'ambiguous-profile-state'
  message: string
  divergence?: unknown
}

export type ProfileStateStartupFailureClass =
  | 'recovery-required'
  | 'ambiguous-authority'
  | 'revision-conflict'
  | 'writer-unavailable'
  | 'newer-schema'
  | 'publication-unavailable'

/** Return the bounded failure class used by startup breadcrumbs and support diagnostics. */
export function profileStateStartupFailureClass(
  error: unknown
): ProfileStateStartupFailureClass | undefined {
  if (isProfileStateRecoveryFailure(error)) {
    return 'recovery-required'
  }
  if (isProfileStateAuthorityFailure(error)) {
    return 'ambiguous-authority'
  }
  if (isRecord(error) && typeof error.code === 'string') {
    if (error.code === 'profile-state-publication-unavailable') {
      return 'publication-unavailable'
    }
    if (error.code === 'newer-schema') {
      return 'newer-schema'
    }
    if (error.code === 'profile-state-revision-conflict') {
      return 'revision-conflict'
    }
    if (error.code.startsWith('profile-state-writer-')) {
      return 'writer-unavailable'
    }
  }
  return undefined
}

/** Both copies are readable and differ only because JSON changed outside SQLite. */
export function isDivergedProfileStateFailure(error: unknown): boolean {
  return isProfileStateAuthorityFailure(error) && error.divergence === 'diverged-json'
}

/** Format profile-state startup failures without exposing a generic fatal-error path. */
export function formatProfileStateStartupFailure(error: unknown): string | undefined {
  if (isProfileStateRecoveryFailure(error)) {
    const retainedBackups = !error.backupPaths?.length
      ? '  (none found)'
      : error.backupPaths.map((path) => `  ${path}`).join('\n')
    const retainedExports =
      error.exportPaths.length === 0
        ? '  (none found)'
        : error.exportPaths.map((path) => `  ${path}`).join('\n')
    const damagedSections = repairableSectionDomains(error)
    if (damagedSections !== undefined && typeof error.profileId === 'string') {
      return [
        `Part of this profile's saved state is damaged: ${profileStateSectionLabels(damagedSections).join(', ')}. Everything else is intact.`,
        `Stop ${PRODUCT_NAME}, then run \`${CLI_NAME} profile state rollback --repair --profile-id ${error.profileId}\` to replace only the damaged parts from backups and keep everything else. ${PRODUCT_NAME} keeps a copy of the damaged file.`,
        `SQLite path: ${error.databaseFile}`,
        `To restore a whole backup instead, run \`${CLI_NAME} profile state exports\`, then \`${CLI_NAME} profile state rollback --backup <id>\`.`
      ].join('\n')
    }
    return [
      `${PRODUCT_NAME} cannot safely open the active profile because its SQLite state is unreadable.`,
      `Legacy JSON path: ${error.dataFile}`,
      `SQLite path: ${error.databaseFile}`,
      'Retained SQLite backups:',
      retainedBackups,
      'Retained JSON exports:',
      retainedExports,
      `Stop ${PRODUCT_NAME}, then run \`${CLI_NAME} profile state exports\` and choose a known-good recovery artifact.`,
      `Restore SQLite with \`${CLI_NAME} profile state rollback --backup <id>\`, or restore a JSON export with`,
      `\`${CLI_NAME} profile state rollback --revision <revision>\`.`
    ].join('\n')
  }

  if (isProfileStateAuthorityFailure(error)) {
    return [
      `${PRODUCT_NAME} cannot safely choose a profile-state authority: ${error.message}`,
      'An older build may have changed the JSON file. Both copies are preserved; neither is selected automatically.',
      `Stop ${PRODUCT_NAME} and copy the profile directory before choosing which state to keep.`,
      `To keep the current JSON, including edits from an older build, run \`${CLI_NAME} profile state rollback --current-json\`. This archives both copies and does not merge their contents.`,
      `Run \`${CLI_NAME} profile state exports\` to inspect retained recovery points.`,
      `Use \`${CLI_NAME} profile state rollback --backup <id>\` or \`${CLI_NAME} profile state rollback --revision <revision>\` only after selecting the state you want to restore.`
    ].join('\n')
  }

  const failureClass = profileStateStartupFailureClass(error)
  if (
    failureClass === 'publication-unavailable' &&
    isRecord(error) &&
    typeof error.message === 'string'
  ) {
    return error.message
  }
  if (failureClass === 'newer-schema') {
    return `This profile was saved by a newer version of ${PRODUCT_NAME}. Open it with that version or a newer release. Your profile has not been changed.`
  }
  if (failureClass === 'revision-conflict') {
    return `The active profile changed while ${PRODUCT_NAME} was starting. Close other ${PRODUCT_NAME} processes using this profile, then restart ${PRODUCT_NAME}.`
  }
  if (failureClass === 'writer-unavailable') {
    return `${PRODUCT_NAME} could not start profile persistence. Restart ${PRODUCT_NAME}; if the problem continues, repair or reinstall this build.`
  }

  return undefined
}

function isProfileStateRecoveryFailure(error: unknown): error is ProfileStateRecoveryFailure {
  return (
    isRecord(error) &&
    error.code === 'profile-state-recovery-required' &&
    typeof error.dataFile === 'string' &&
    typeof error.databaseFile === 'string' &&
    Array.isArray(error.exportPaths) &&
    error.exportPaths.every((path) => typeof path === 'string') &&
    (error.backupPaths === undefined ||
      (Array.isArray(error.backupPaths) &&
        error.backupPaths.every((path) => typeof path === 'string')))
  )
}

function repairableSectionDomains(error: ProfileStateRecoveryFailure): string[] | undefined {
  const sections = error.repairableSections
  if (!Array.isArray(sections) || sections.length === 0) {
    return undefined
  }
  const domains = sections.map((section: unknown) =>
    isRecord(section) && typeof section.domain === 'string' ? section.domain : undefined
  )
  return domains.every((domain): domain is string => domain !== undefined) ? domains : undefined
}

function isProfileStateAuthorityFailure(error: unknown): error is ProfileStateAuthorityFailure {
  return (
    isRecord(error) && error.code === 'ambiguous-profile-state' && typeof error.message === 'string'
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
