import { app } from 'electron'
import { resolveAppImageRuntimeIdentity } from '../appimage-runtime-identity'
import { prepareAppImageCopyForServe } from '../cli/appimage-serve-preparation'
import { CliInstaller } from '../cli/cli-installer'
import { installLinuxBareOrcaDispatcher } from '../cli/linux-bare-orca-dispatcher'
import { CLI_NAME, LINUX_CLI_NAME } from '../../shared/product-brand'

/** Headless serve has no renderer to run the normal cli:install flow, so it registers here. */
export async function registerCliForHeadlessServe(): Promise<void> {
  // Windows-excluded: install() only mutates registry PATH, not child terminals.
  if (process.platform !== 'darwin' && process.platform !== 'linux') {
    return
  }
  const appImagePath =
    process.platform === 'linux' ? (resolveAppImageRuntimeIdentity()?.appImagePath ?? null) : null
  let appImageDeadlineAt: number | undefined
  if (appImagePath) {
    // Why first: CLI install and the bare dispatcher would otherwise each wait out their own
    // extraction timeout; this gives the whole AppImage wait one deadline and visible progress.
    const preparation = await prepareAppImageCopyForServe({ appImagePath })
    if (preparation.status === 'unavailable') {
      console.warn(`[serve] orca CLI install skipped: ${preparation.reason}`)
      return
    }
    appImageDeadlineAt = preparation.deadlineAt
  }
  try {
    // Why: serve is headless — a fallback osascript admin prompt would hang it; skip elevation since ~/.local/bin needs none.
    const cliStatus = await new CliInstaller({
      privilegedRunner: async () => {
        throw new Error('serve CLI auto-install must not request administrator privileges')
      },
      ...(appImageDeadlineAt === undefined ? {} : { appImageDeadlineAt })
    }).install()
    console.log(
      `[serve] orca CLI install: ${cliStatus.state}${cliStatus.commandPath ? ` (${cliStatus.commandPath})` : ''}`
    )
  } catch (error) {
    console.warn(
      '[serve] orca CLI install skipped:',
      error instanceof Error ? error.message : String(error)
    )
  }
  // Why: when the Linux CLI installs under another name, the Claude Team launcher's bare CLI_NAME needs a ~/.local/bin dispatcher (ahead of /usr/bin). Best-effort.
  if (
    process.platform === 'linux' &&
    LINUX_CLI_NAME !== CLI_NAME &&
    app.isPackaged &&
    process.resourcesPath
  ) {
    try {
      const dispatcher = await installLinuxBareOrcaDispatcher({
        resourcesPath: process.resourcesPath,
        ...(appImageDeadlineAt === undefined ? {} : { appImageDeadlineAt })
      })
      console.log(
        `[serve] bare orca dispatcher ${dispatcher.state}: ${dispatcher.dispatcherPath}` +
          `${dispatcher.target ? ` -> ${dispatcher.target}` : ''}`
      )
    } catch (error) {
      console.warn(
        '[serve] bare orca dispatcher install skipped:',
        error instanceof Error ? error.message : String(error)
      )
    }
  }
}
