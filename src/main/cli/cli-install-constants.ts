import { CLI_NAME, DEV_CLI_NAME, LEGACY_CLI_NAMES, PRODUCT_NAME } from '../../shared/product-brand'

export const DEFAULT_MAC_COMMAND_PATH = `/usr/local/bin/${CLI_NAME}`
export const DEV_COMMAND_NAME = DEV_CLI_NAME
// Why: an older build registered these; registration removes them only when they point into this app.
export const LEGACY_PACKAGED_COMMAND_NAMES = LEGACY_CLI_NAMES.filter(
  (name) => !name.endsWith('-dev')
)
export const LEGACY_DEV_COMMAND_NAMES = LEGACY_CLI_NAMES.filter((name) => name.endsWith('-dev'))
export const DEV_LAUNCHER_DIR = ['cli', 'bin'] as const
export const WINDOWS_PATH_WRITE_TIMEOUT_MS = 5_000

export function refuseToReplaceCommandError(commandPath: string): Error {
  return new Error(
    `Refusing to replace non-${PRODUCT_NAME} command at ${commandPath}. Remove it and register again if it is no longer needed.`
  )
}
