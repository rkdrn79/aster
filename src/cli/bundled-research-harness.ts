import { existsSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

/** Resolve the harness shipped with this CLI, without relying on a source checkout. */
export function resolveBundledResearchHarnessCli(runtimeDir = __dirname): string | null {
  const appRoot = resolve(runtimeDir, '..', '..')
  const directory =
    basename(appRoot) === 'app.asar.unpacked'
      ? resolve(appRoot, '..', 'research-harness')
      : join(appRoot, 'src', 'research-harness')
  const cli = join(directory, 'cli.mjs')
  return existsSync(cli) ? cli : null
}
