import { CLI_NAME, DEV_CLI_NAME, LINUX_CLI_NAME } from './product-brand'

// Other names this product's CLI installs under (dev wrapper, Linux package name).
export const CLI_ALTERNATE_NAMES = [DEV_CLI_NAME, LINUX_CLI_NAME].filter(
  (name) => name !== CLI_NAME
)

export function getCliCommandNameForPlatform(platform: NodeJS.Platform): string {
  if (platform === 'linux') {
    return LINUX_CLI_NAME
  }
  if (platform === 'win32') {
    return `${CLI_NAME}.cmd`
  }
  return CLI_NAME
}
