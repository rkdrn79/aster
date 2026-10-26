import type { CommandHandler } from '../dispatch'
import { getOptionalServePort } from '../runtime/serve-port-flag'
import { formatServeServiceInstall, formatServeServiceStatus } from './serve-service-format'
import {
  installServeService,
  readServeServiceStatus,
  uninstallServeService
} from '../runtime/serve-service-management'

export {
  installServeService,
  readServeServiceStatus,
  uninstallServeService
} from '../runtime/serve-service-management'
export type { ServeServiceDeps, ServeServiceStatus } from '../runtime/serve-service-management'

/** Local, runtime-free output: the same envelope shape `--json` callers get elsewhere. */
function emit<T>(result: T, json: boolean, format: (value: T) => string): void {
  console.log(json ? JSON.stringify({ ok: true, result }, null, 2) : format(result))
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

export const SERVE_SERVICE_HANDLERS: Record<string, CommandHandler> = {
  'serve service install': async ({ flags, json }) => {
    const result = await installServeService({
      command: optionalString(flags.get('command')),
      // Why validate here: a bad value fails before the supervisor's brake and launchd would loop.
      port: getOptionalServePort(flags),
      pairingAddress: optionalString(flags.get('pairing-address')),
      dryRun: flags.get('dry-run') === true
    })
    emit(result, json, formatServeServiceInstall)
  },
  'serve service status': async ({ json }) => {
    const result = await readServeServiceStatus()
    emit(result, json, formatServeServiceStatus)
  },
  'serve service uninstall': async ({ json }) => {
    const result = await uninstallServeService()
    emit(result, json, (value) =>
      value.removed ? `Removed ${String(value.name)}.` : `${String(value.name)} was not installed.`
    )
  }
}
