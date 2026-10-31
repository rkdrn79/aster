import { existsSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { ORCAD_RESEARCH_HARNESS_CLI_FILENAME } from '../shared/orcad-artifacts'

/** Resolve the harness shipped with this CLI, without relying on a source checkout. */
export function resolveBundledResearchHarnessCli(runtimeDir = __dirname): string | null {
  const appRoot = resolve(runtimeDir, '..', '..')
  const candidates =
    basename(appRoot) === 'app.asar.unpacked'
      ? [resolve(appRoot, '..', 'research-harness', 'cli.mjs')]
      : [
          // An orcad slot on an SSH host ships the harness beside its CLI.
          join(appRoot, ...ORCAD_RESEARCH_HARNESS_CLI_FILENAME.split('/')),
          join(appRoot, 'src', 'research-harness', 'cli.mjs')
        ]
  return candidates.find((cli) => existsSync(cli)) ?? null
}
