import { existsSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

/**
 * The skill packages shipped with this CLI's own app, or null when any of `names` is missing
 * (a remote host's server bundle carries no packages).
 */
export function resolveBundledSkillPackagesDirectory(
  names: readonly string[],
  runtimeDir = __dirname
): string | null {
  // Packaged: <Resources>/app.asar.unpacked/out/cli -> <Resources>/skills; checkout: <repo>/skills.
  const appRoot = resolve(runtimeDir, '..', '..')
  const directory =
    basename(appRoot) === 'app.asar.unpacked'
      ? resolve(appRoot, '..', 'skills')
      : resolve(appRoot, 'skills')
  if (names.length === 0) {
    return null
  }
  return names.every((name) => existsSync(join(directory, name, 'SKILL.md'))) ? directory : null
}
