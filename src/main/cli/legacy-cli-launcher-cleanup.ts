import { rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { LEGACY_CLI_NAMES } from '../../shared/product-brand'
import { LEGACY_DEV_COMMAND_NAMES, LEGACY_PACKAGED_COMMAND_NAMES } from './cli-install-constants'

/**
 * Drops launchers an older build left in a directory only this app writes, so a PATH that
 * includes it exposes only the current command name. A launcher still running stays until later.
 */
export function removeLegacyCliLaunchers(
  directory: string,
  suffixes: readonly string[] = ['']
): void {
  for (const name of LEGACY_CLI_NAMES) {
    for (const suffix of suffixes) {
      try {
        rmSync(join(directory, `${name}${suffix}`), { force: true })
      } catch {
        // Best-effort: Windows keeps a running executable's image locked.
      }
    }
  }
}

/** Where an older build may have registered an upstream-named command for this install. */
export function legacyCliCommandPaths(options: {
  platform: NodeJS.Platform
  isPackaged: boolean
  homePath: string
  macCommandPath: string
}): string[] {
  if (options.platform !== 'linux' && options.platform !== 'darwin') {
    return []
  }
  const names = options.isPackaged ? LEGACY_PACKAGED_COMMAND_NAMES : LEGACY_DEV_COMMAND_NAMES
  const userBinDir = join(options.homePath, '.local', 'bin')
  // Why both on macOS: older builds fell back to ~/.local/bin where /usr/local/bin was absent.
  const directories =
    options.platform === 'darwin'
      ? [...new Set([dirname(options.macCommandPath), userBinDir])]
      : [userBinDir]
  return directories.flatMap((directory) => names.map((name) => join(directory, name)))
}
