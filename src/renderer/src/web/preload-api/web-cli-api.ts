import type { PreloadApi } from '../../../../preload/api-types'
import { getBrowserPlatform } from './web-storage'
import { CLI_NAME, LINUX_CLI_NAME, PRODUCT_NAME } from '../../../../shared/product-brand'

export function createCliApi(): NonNullable<Partial<PreloadApi>['cli']> {
  const status = {
    platform: getBrowserPlatform(),
    commandName: getBrowserPlatform() === 'linux' ? LINUX_CLI_NAME : CLI_NAME,
    commandPath: null,
    pathDirectory: null,
    pathConfigured: false,
    launcherPath: null,
    installMethod: null,
    supported: false,
    state: 'unsupported',
    currentTarget: null,
    unsupportedReason: 'launch_mode_unavailable',
    detail: `CLI registration is managed on the ${PRODUCT_NAME} server, not in the web browser.`
  } as const
  return {
    getInstallStatus: () => Promise.resolve(status),
    install: () => Promise.resolve(status),
    remove: () => Promise.resolve(status),
    getWslInstallStatus: (_args?: { distro?: string | null }) => Promise.resolve(status),
    installWsl: (_args?: { distro?: string | null }) => Promise.resolve(status),
    removeWsl: (_args?: { distro?: string | null }) => Promise.resolve(status)
  } as NonNullable<Partial<PreloadApi>['cli']>
}
