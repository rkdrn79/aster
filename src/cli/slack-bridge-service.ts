import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { CLI_NAME, PRODUCT_BRAND, PRODUCT_NAME } from '../shared/product-brand'
import {
  renderLaunchAgent,
  renderServeService,
  resolveServeServiceManager,
  serviceProfileSuffix,
  systemdQuote,
  type ServeServiceManager
} from './runtime/serve-service-unit'
import {
  loadUserService,
  mustRunUserServiceCommand,
  probeUserService,
  unloadUserService,
  type UserServiceProbe,
  type UserServiceRun
} from './runtime/user-service-manager'
import type { CommandRunner } from './slack-token-store'

export type SlackServiceDeps = {
  platform: NodeJS.Platform
  homeDir: string
  uid: number
  /** PATH the unit pins, so agents started by the service find the same tools. */
  path: string
  userDataPath: string
  defaultUserDataPath: string
  run: CommandRunner
}

export type SlackBridgeServiceSpec = {
  manager: ServeServiceManager
  name: string
  unitPath: string
  logPath: string | null
  content: string
}

export const SLACK_SERVICE_UNSUPPORTED =
  'Keeping Slack connected in the background is not available on Windows yet.'

function managerFor(platform: NodeJS.Platform): ServeServiceManager {
  const manager = resolveServeServiceManager(platform)
  if (!manager) {
    throw new Error(SLACK_SERVICE_UNSUPPORTED)
  }
  return manager
}

function managerRun(run: CommandRunner): UserServiceRun {
  return async (program, args) => {
    const result = await run(program, args)
    return { code: result.code, out: `${result.stdout}${result.stderr}` }
  }
}

/** The background runtime (`serve service`) unit for the same profile. */
function runtimeUnit(deps: SlackServiceDeps): { name: string; unitPath: string } {
  return renderServeService({
    platform: deps.platform,
    homeDir: deps.homeDir,
    command: CLI_NAME,
    userDataPath: deps.userDataPath,
    defaultUserDataPath: deps.defaultUserDataPath,
    path: deps.path
  })
}

/**
 * Tokens never appear here: the bridge reads them from the login Keychain or the profile's
 * owner-only token file at start (`--service`).
 */
export function renderSlackBridgeService(
  deps: SlackServiceDeps,
  command: string,
  bridgeArgs: readonly string[]
): SlackBridgeServiceSpec {
  const manager = managerFor(deps.platform)
  const suffix = serviceProfileSuffix(deps)
  const env = { PATH: deps.path, ORCA_USER_DATA_PATH: deps.userDataPath }
  const argv = [command, 'slack', 'bridge', ...bridgeArgs, '--service']
  if (manager === 'launchd') {
    const name = `${PRODUCT_BRAND.appId}.slack-bridge${suffix ? `.${suffix}` : ''}`
    const logPath = join(deps.homeDir, 'Library', 'Logs', PRODUCT_NAME, `${name}.log`)
    return {
      manager,
      name,
      unitPath: join(deps.homeDir, 'Library', 'LaunchAgents', `${name}.plist`),
      logPath,
      content: renderLaunchAgent(name, argv, env, logPath)
    }
  }
  const name = `${PRODUCT_BRAND.id}-slack-bridge${suffix ? `-${suffix}` : ''}.service`
  const runtime = runtimeUnit(deps).name
  const environment = Object.entries(env)
    .map(([key, value]) => `Environment=${systemdQuote(`${key}=${value}`)}`)
    .join('\n')
  // Why Wants= the runtime: without it the bridge can receive a mention but no agent can answer.
  const content = `[Unit]
Description=${PRODUCT_NAME} Slack bridge (${CLI_NAME} slack bridge --service)
Wants=${runtime}
After=${runtime} network-online.target
StartLimitIntervalSec=900
StartLimitBurst=5

[Service]
Type=simple
ExecStart=${argv.map(systemdQuote).join(' ')}
${environment}
Restart=on-failure
RestartSec=10
TimeoutStopSec=30

[Install]
WantedBy=default.target
`
  return {
    manager,
    name,
    unitPath: join(deps.homeDir, '.config', 'systemd', 'user', name),
    logPath: null,
    content
  }
}

export async function installSlackBridgeService(
  deps: SlackServiceDeps,
  command: string,
  bridgeArgs: readonly string[]
): Promise<SlackBridgeServiceSpec> {
  const spec = renderSlackBridgeService(deps, command, bridgeArgs)
  const previous = existsSync(spec.unitPath) ? readFileSync(spec.unitPath, 'utf8') : null
  mkdirSync(dirname(spec.unitPath), { recursive: true })
  writeFileSync(spec.unitPath, spec.content, { mode: 0o644 })
  if (spec.logPath) {
    mkdirSync(dirname(spec.logPath), { recursive: true, mode: 0o700 })
  }
  try {
    await loadUserService(managerRun(deps.run), deps.uid, spec)
  } catch (error) {
    if (previous === null) {
      await unloadUserService(managerRun(deps.run), deps.uid, spec)
    } else {
      writeFileSync(spec.unitPath, previous, { mode: 0o644 })
      await loadUserService(managerRun(deps.run), deps.uid, spec).catch(() => undefined)
    }
    throw error
  }
  return spec
}

/** Restarts a loaded service so it rereads its tokens. */
export async function restartSlackBridgeService(deps: SlackServiceDeps): Promise<void> {
  const spec = renderSlackBridgeService(deps, CLI_NAME, [])
  const run = managerRun(deps.run)
  await (spec.manager === 'launchd'
    ? mustRunUserServiceCommand(run, 'launchctl', [
        'kickstart',
        '-k',
        `gui/${deps.uid}/${spec.name}`
      ])
    : mustRunUserServiceCommand(run, 'systemctl', ['--user', 'restart', spec.name]))
}

export async function uninstallSlackBridgeService(deps: SlackServiceDeps): Promise<boolean> {
  return await unloadUserService(
    managerRun(deps.run),
    deps.uid,
    renderSlackBridgeService(deps, CLI_NAME, [])
  )
}

export async function readSlackBridgeServiceStatus(deps: SlackServiceDeps): Promise<
  UserServiceProbe & {
    installed: boolean
    name: string
    unitPath: string
    runtimeInstalled: boolean
  }
> {
  const spec = renderSlackBridgeService(deps, CLI_NAME, [])
  return {
    installed: existsSync(spec.unitPath),
    name: spec.name,
    unitPath: spec.unitPath,
    runtimeInstalled: existsSync(runtimeUnit(deps).unitPath),
    ...(await probeUserService(managerRun(deps.run), deps.uid, spec))
  }
}
