import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import {
  installServeService,
  readServeServiceStatus,
  uninstallServeService,
  type ServeServiceDeps
} from '../../cli/runtime/serve-service-management'
import {
  installSlackBridgeService,
  restartSlackBridgeService,
  SLACK_SERVICE_UNSUPPORTED,
  uninstallSlackBridgeService,
  type SlackServiceDeps
} from '../../cli/slack-bridge-service'
import {
  deleteSlackServiceTokens,
  writeSlackServiceTokens,
  type SlackTokens
} from '../../cli/slack-token-store'
import { writeSecureFile } from '../../shared/secure-file'

// Why its own file: connection-v1.json is strict, so a new key there would break older builds.
const configSchema = z
  .object({ version: z.literal(1), enabled: z.boolean(), installedRuntime: z.boolean() })
  .strict()
export type SlackBackgroundConfig = z.infer<typeof configSchema>
const OFF: SlackBackgroundConfig = { version: 1, enabled: false, installedRuntime: false }

export type SlackBackgroundHost = SlackServiceDeps & {
  env: NodeJS.ProcessEnv
  isPackaged: boolean
  /** The stable launcher both units run; throws when this build has none. */
  command: () => string
}

export function slackBackgroundUnavailableReason(
  host: Pick<SlackBackgroundHost, 'platform' | 'isPackaged'>
): string | null {
  if (host.platform !== 'darwin' && host.platform !== 'linux') {
    return SLACK_SERVICE_UNSUPPORTED
  }
  return host.isPackaged
    ? null
    : 'Development builds cannot install the background Slack service. Use an installed Aster app.'
}

function configPath(userDataPath: string): string {
  return join(userDataPath, 'slack', 'background-v1.json')
}

export function readSlackBackgroundConfig(userDataPath: string): SlackBackgroundConfig {
  try {
    return configSchema.parse(JSON.parse(readFileSync(configPath(userDataPath), 'utf8')))
  } catch (error) {
    if (!(error instanceof Error) || Reflect.get(error, 'code') !== 'ENOENT') {
      console.warn('[slack] ignoring unreadable background setting:', error)
    }
    return OFF
  }
}

function saveConfig(userDataPath: string, config: SlackBackgroundConfig): void {
  if (!writeSecureFile(configPath(userDataPath), JSON.stringify(config), { durable: true })) {
    throw new Error('The Slack background setting could not be saved')
  }
}

function serveDeps(host: SlackBackgroundHost): ServeServiceDeps {
  return {
    platform: host.platform,
    // Why pin: the runtime unit must serve this app's profile, whatever the caller's env says.
    env: { ...host.env, ORCA_USER_DATA_PATH: host.userDataPath },
    homeDir: host.homeDir,
    uid: host.uid,
    run: async (program, args) => {
      const result = await host.run(program, args)
      return { code: result.code, out: `${result.stdout}${result.stderr}` }
    }
  }
}

/**
 * Stores the tokens for the service, installs the background runtime when the profile has none
 * (agents need one to answer while the app is closed), then the bridge service. A failure
 * undoes every step so the app's own bridge can take over again.
 */
export async function enableSlackBackground(
  host: SlackBackgroundHost,
  tokens: SlackTokens,
  routesFile: string
): Promise<SlackBackgroundConfig> {
  const reason = slackBackgroundUnavailableReason(host)
  if (reason) {
    throw new Error(reason)
  }
  const command = host.command()
  const previous = readSlackBackgroundConfig(host.userDataPath)
  try {
    await writeSlackServiceTokens(tokens, host)
    let installedRuntime = previous.installedRuntime
    const serve = serveDeps(host)
    if (!(await readServeServiceStatus(serve)).installed) {
      await installServeService({ command, dryRun: false }, serve)
      installedRuntime = true
    }
    // Why save first: if the bridge install fails, disabling still knows to remove the runtime.
    const next: SlackBackgroundConfig = { version: 1, enabled: true, installedRuntime }
    saveConfig(host.userDataPath, next)
    await installSlackBridgeService(host, command, ['--routes-file', routesFile])
    return next
  } catch (error) {
    await disableSlackBackground(host).catch((cleanup: unknown) =>
      console.warn('[slack] could not undo a partial background install:', cleanup)
    )
    throw error
  }
}

/** Removes the bridge service and its stored tokens, and the runtime only if this installed it. */
export async function disableSlackBackground(host: SlackBackgroundHost): Promise<void> {
  if (slackBackgroundUnavailableReason({ platform: host.platform, isPackaged: true })) {
    return
  }
  const config = readSlackBackgroundConfig(host.userDataPath)
  await uninstallSlackBridgeService(host)
  await deleteSlackServiceTokens(host)
  if (config.installedRuntime) {
    await uninstallServeService(serveDeps(host))
  }
  saveConfig(host.userDataPath, OFF)
}

export async function refreshSlackBackgroundTokens(
  host: SlackBackgroundHost,
  tokens: SlackTokens
): Promise<void> {
  await writeSlackServiceTokens(tokens, host)
  await restartSlackBridgeService(host)
}
