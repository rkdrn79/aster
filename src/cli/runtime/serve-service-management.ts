import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname } from 'node:path'
import { runProcess } from '@orca/process-host'
import { RuntimeClientError } from './types'
import { resolveLaunchUserDataPath } from './launch-user-data-path'
import { getPlatformUserDataPath } from './metadata'
import { clearServeSupervisorBrake, readServeSupervisorBrake } from './serve-supervisor-brake'
import {
  renderServeService,
  resolveServeServiceManager,
  type ServeServiceSpec
} from './serve-service-unit'
import { resolveServiceCommand } from './serve-app-launcher'
import { loadUserService, probeUserService, unloadUserService } from './user-service-manager'
import { CLI_NAME } from '../../shared/product-brand'

type Run = (program: string, args: string[]) => Promise<{ code: number | null; out: string }>

export type ServeServiceDeps = {
  platform: NodeJS.Platform
  env: NodeJS.ProcessEnv
  homeDir: string
  uid: number
  run: Run
}

const defaultRun: Run = async (program, args) => {
  try {
    const result = await runProcess({ program, args, timeoutMs: 20_000 })
    return { code: result.timedOut ? null : result.code, out: `${result.stdout}${result.stderr}` }
  } catch (error) {
    return { code: null, out: error instanceof Error ? error.message : String(error) }
  }
}

function defaultDeps(): ServeServiceDeps {
  return {
    platform: process.platform,
    env: process.env,
    homeDir: homedir(),
    uid: process.getuid?.() ?? 0,
    run: defaultRun
  }
}

function requireManager(platform: NodeJS.Platform): void {
  if (!resolveServeServiceManager(platform)) {
    throw new RuntimeClientError(
      'unsupported_platform',
      `\`${CLI_NAME} serve service\` is not available on Windows yet. Run \`${CLI_NAME} serve\` under a service wrapper of your own.`
    )
  }
}

function serviceSpec(
  deps: ServeServiceDeps,
  options: { command: string; port?: string | null; pairingAddress?: string | null }
): ServeServiceSpec {
  return renderServeService({
    platform: deps.platform,
    homeDir: deps.homeDir,
    command: options.command,
    userDataPath: resolveLaunchUserDataPath(deps.env),
    defaultUserDataPath: getPlatformUserDataPath(deps.platform, deps.homeDir),
    path: deps.env.PATH ?? '/usr/bin:/bin',
    port: options.port,
    pairingAddress: options.pairingAddress
  })
}

async function lingerState(deps: ServeServiceDeps): Promise<'yes' | 'no' | 'unknown'> {
  const result = await deps.run('loginctl', [
    'show-user',
    String(deps.uid),
    '--property=Linger',
    '--value'
  ])
  const value = result.out.trim()
  return result.code === 0 && (value === 'yes' || value === 'no') ? value : 'unknown'
}

export async function installServeService(
  options: {
    command: string | null
    port?: string | null
    pairingAddress?: string | null
    dryRun: boolean
  },
  deps: ServeServiceDeps = defaultDeps()
): Promise<Record<string, unknown>> {
  requireManager(deps.platform)
  const spec = serviceSpec(deps, {
    ...options,
    command: resolveServiceCommand(options.command, deps)
  })
  if (options.dryRun) {
    return { installed: false, dryRun: true, ...spec }
  }
  mkdirSync(dirname(spec.unitPath), { recursive: true })
  writeFileSync(spec.unitPath, spec.content, { mode: 0o644 })
  if (spec.logPath) {
    mkdirSync(dirname(spec.logPath), { recursive: true, mode: 0o700 })
  }
  // Why: installing is the documented way to retry after the crash-loop brake gave up.
  clearServeSupervisorBrake(resolveLaunchUserDataPath(deps.env))
  await loadUserService(deps.run, deps.uid, spec)
  if (spec.manager === 'launchd') {
    return {
      installed: true,
      manager: spec.manager,
      name: spec.name,
      unitPath: spec.unitPath,
      logPath: spec.logPath
    }
  }
  return {
    installed: true,
    manager: spec.manager,
    name: spec.name,
    unitPath: spec.unitPath,
    linger: await lingerState(deps)
  }
}

export type ServeServiceStatus = {
  installed: boolean
  manager: ServeServiceSpec['manager']
  name: string
  unitPath: string
  /** Execution-boundary verdict for the supervisor: never guessed when the manager cannot answer. */
  verdict: 'live' | 'exited' | 'unverifiable'
  pid: number | null
  detail: string
  gaveUp: string | null
}

export async function readServeServiceStatus(
  deps: ServeServiceDeps = defaultDeps()
): Promise<ServeServiceStatus> {
  requireManager(deps.platform)
  const spec = serviceSpec(deps, { command: CLI_NAME })
  const base = {
    installed: existsSync(spec.unitPath),
    manager: spec.manager,
    name: spec.name,
    unitPath: spec.unitPath,
    gaveUp: readServeSupervisorBrake(resolveLaunchUserDataPath(deps.env))?.gaveUp?.reason ?? null
  }
  return { ...base, ...(await probeUserService(deps.run, deps.uid, spec)) }
}

export async function uninstallServeService(
  deps: ServeServiceDeps = defaultDeps()
): Promise<Record<string, unknown>> {
  requireManager(deps.platform)
  const spec = serviceSpec(deps, { command: CLI_NAME })
  const existed = await unloadUserService(deps.run, deps.uid, spec)
  return { removed: existed, manager: spec.manager, name: spec.name, unitPath: spec.unitPath }
}
