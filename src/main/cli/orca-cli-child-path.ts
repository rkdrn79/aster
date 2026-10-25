/**
 * The PATH entry through which an Orca-launched child reaches THIS app's own CLI.
 *
 * Extracted from `buildPtyHostEnv` so the structured-session lane can apply the identical
 * treatment. A structured worker has no PTY, but its provider child runs `<cli> orchestration ...`
 * exactly like a PTY worker's agent does, and it was inheriting the ambient PATH instead, which
 * reached this app's bundled CLI only if the user had separately registered the CLI globally (and
 * on upstream's Linux, where the CLI is `orca-ide`, bare `orca` is GNOME's screen reader).
 *
 * `platform` is a test seam only: production leaves it unset and reads `process.platform`, so
 * every branch behaves exactly as it did inside `buildPtyHostEnv`.
 */

import { delimiter, dirname, join } from 'node:path'
import { getAppEnvironment, hasAppEnvironment } from '../../shared/app-environment'
import { readInheritedPath } from '../ipc/pty/host-env/path'
import { resolvePathEnvKey } from '../pty/windows-environment-path'
import { ensureLinuxTerminalOrcaCliShimDir } from './linux-terminal-orca-cli-shim'
import { getBundledLauncherPath } from './bundled-cli-launcher-path'
import { DEV_COMMAND_NAME } from './cli-install-constants'
import { CLI_NAME } from '../../shared/product-brand'

export type OrcaCliChildPathOptions = {
  isPackaged: boolean
  userDataPath: string
  resourcesPath?: string | null
  /** Test seam — production reads the real platform, which is what every branch below assumes. */
  platform?: NodeJS.Platform
}

/**
 * Mutates `env` in place, prepending the directory that makes bare CLI_NAME this app's CLI. Returns
 * the absolute launcher in that directory, or null when none was prepended: a child whose shell
 * rebuilds PATH (a login shell reordering it behind a global install) can still name this app's
 * CLI by path.
 */
export function prependOrcaCliDirToChildPath(
  env: Record<string, string>,
  opts: OrcaCliChildPathOptions
): string | null {
  const platform = opts.platform ?? process.platform
  delete env.ORCA_CLI_BIN_DIR
  // Why: matches node:path's `delimiter` for the running platform, but stays correct when a test
  // drives a foreign platform through the seam.
  const pathDelimiter = platform === 'win32' ? ';' : delimiter
  const hostLauncher = hasAppEnvironment() ? getAppEnvironment().getCliLauncherPath?.() : null
  if (hostLauncher) {
    const binDir = dirname(hostLauncher)
    const inheritedEntries = readInheritedPath(env, platform)
      .split(pathDelimiter)
      .filter((entry) => entry.length > 0 && entry !== binDir)
    env[resolvePathEnvKey(env, platform)] = [binDir, ...inheritedEntries].join(pathDelimiter)
    if (platform !== 'win32') {
      env.ORCA_CLI_BIN_DIR = binDir
    }
    env.ORCA_USER_DATA_PATH = opts.userDataPath
    env.ORCA_CLI_COMMAND = hostLauncher
    return hostLauncher
  }
  // Why: dev mode needs the launcher PATH override so the CLI resolves to the dev build instead of the production command.
  if (!opts.isPackaged) {
    const devCliBin = join(opts.userDataPath, 'cli', 'bin')
    if (platform !== 'win32') {
      env.ORCA_CLI_BIN_DIR = devCliBin
    }
    const inheritedPath = readInheritedPath(env, platform)
    // Why: an empty PATH segment resolves as `.` in some shells (commands run from cwd); avoid a trailing delimiter.
    env[resolvePathEnvKey(env, platform)] = inheritedPath
      ? `${devCliBin}${pathDelimiter}${inheritedPath}`
      : devCliBin
    return join(devCliBin, platform === 'win32' ? `${DEV_COMMAND_NAME}.cmd` : DEV_COMMAND_NAME)
  } else if (platform === 'linux') {
    // Why: a bare CLI_NAME shim scoped to this app's PTYs; see ensureLinuxTerminalOrcaCliShimDir.
    const shimDir = ensureLinuxTerminalOrcaCliShimDir({ userDataPath: opts.userDataPath })
    if (shimDir) {
      env.ORCA_CLI_BIN_DIR = shimDir
      const inheritedEntries = readInheritedPath(env, platform)
        .split(pathDelimiter)
        .filter((entry) => entry.length > 0 && entry !== shimDir)
      env.PATH = [shimDir, ...inheritedEntries].join(pathDelimiter)
      return join(shimDir, CLI_NAME)
    }
  } else if (opts.resourcesPath && (platform === 'darwin' || platform === 'win32')) {
    // Why: global CLI registration is optional, but agents in Orca-managed PTYs must always reach this app's bundled CLI.
    const bundledCliBin = join(opts.resourcesPath, 'bin')
    if (platform === 'darwin') {
      env.ORCA_CLI_BIN_DIR = bundledCliBin
    }
    const inheritedPath = readInheritedPath(env, platform)
    env[resolvePathEnvKey(env, platform)] = inheritedPath
      ? `${bundledCliBin}${pathDelimiter}${inheritedPath}`
      : bundledCliBin
    // Why the native launcher on Windows: the `.cmd` shim refuses message bodies cmd.exe would mangle.
    return getBundledLauncherPath(platform, opts.resourcesPath)
  }
  return null
}
