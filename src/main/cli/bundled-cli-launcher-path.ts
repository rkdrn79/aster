import { join } from 'node:path'
import { CLI_NAME, LINUX_CLI_NAME } from '../../shared/product-brand'

export const LINUX_CLI_COMMAND_NAME = LINUX_CLI_NAME

/** Absolute path of the CLI launcher this app ships in its own resources bundle.
 *  Lives apart from cli-installer so callers that only need the path (PTY env
 *  assembly) don't pull in the installer's `electron` dependency. */
export function getBundledLauncherPath(
  platform: NodeJS.Platform,
  resourcesPath: string
): string | null {
  if (platform === 'darwin') {
    return join(resourcesPath, 'bin', CLI_NAME)
  }
  if (platform === 'linux') {
    return join(resourcesPath, 'bin', LINUX_CLI_COMMAND_NAME)
  }
  if (platform === 'win32') {
    return join(resourcesPath, 'bin', `${CLI_NAME}.exe`)
  }
  return null
}
