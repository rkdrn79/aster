import { app } from 'electron'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

// Packaged builds ship packages beside resources/skills/current-manifest.json; dev reads the
// checkout's skills/ tree that manifest is generated from.
export function bundledSkillPackagesDirectory(): string {
  return app.isPackaged ? join(process.resourcesPath, 'skills') : resolve(process.cwd(), 'skills')
}

/**
 * The directory `skills add` can install `names` from on this machine, or null when any
 * package is missing (a build that ships only the freshness manifest).
 */
export function resolveBundledSkillSource(
  names: readonly string[],
  directory = bundledSkillPackagesDirectory()
): string | null {
  if (names.length === 0) {
    return null
  }
  return names.every((name) => existsSync(join(directory, name, 'SKILL.md'))) ? directory : null
}
