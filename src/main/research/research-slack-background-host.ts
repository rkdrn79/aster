import { homedir } from 'node:os'
import { app } from 'electron'
import { getPlatformUserDataPath } from '../../cli/runtime/metadata'
import { resolveServiceCommand } from '../../cli/runtime/serve-app-launcher'
import { defaultCommandRunner } from '../../cli/slack-token-store'
import { CLI_NAME, PRODUCT_NAME } from '../../shared/product-brand'
import { getBundledLauncherPath } from '../cli/bundled-cli-launcher-path'
import { getCanonicalUserDataPath } from '../persistence/loading-store/user-data-path'
import type { SlackBackgroundHost } from './research-slack-background'

/** The launcher the services run must outlive app updates, so never this version's own files. */
function backgroundCommand(): string {
  const env = { ...process.env, ORCA_USER_DATA_PATH: getCanonicalUserDataPath() }
  const bundled = getBundledLauncherPath(process.platform, process.resourcesPath)
  for (const candidate of [bundled, null]) {
    try {
      return resolveServiceCommand(candidate, { platform: process.platform, env })
    } catch {
      // Why: an AppImage's bundled launcher lives in a per-run mount; fall back to the installed command.
    }
  }
  throw new Error(
    `Install the \`${CLI_NAME}\` command from ${PRODUCT_NAME} Settings first; this build has no stable launcher for a background service.`
  )
}

export function backgroundHost(): SlackBackgroundHost {
  return {
    platform: process.platform,
    homeDir: homedir(),
    uid: process.getuid?.() ?? 0,
    path: process.env.PATH ?? '/usr/bin:/bin',
    userDataPath: getCanonicalUserDataPath(),
    defaultUserDataPath: getPlatformUserDataPath(process.platform, homedir()),
    run: defaultCommandRunner,
    env: process.env,
    isPackaged: app.isPackaged,
    command: backgroundCommand
  }
}
