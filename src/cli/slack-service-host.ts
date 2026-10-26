import { homedir } from 'node:os'
import { delayUnlessAborted } from '../shared/abort-aware-delay'
import { resolveLaunchUserDataPath } from './runtime/launch-user-data-path'
import { getPlatformUserDataPath } from './runtime/metadata'
import { RuntimeClientError } from './runtime/types'
import { SLACK_SERVICE_UNSUPPORTED, type SlackServiceDeps } from './slack-bridge-service'
import {
  defaultCommandRunner,
  readSlackServiceTokens,
  slackTokenStoreKind,
  type SlackTokens
} from './slack-token-store'

export function slackServiceDeps(
  userDataPath = resolveLaunchUserDataPath(process.env)
): SlackServiceDeps {
  if (!slackTokenStoreKind(process.platform)) {
    throw new RuntimeClientError('unsupported_platform', SLACK_SERVICE_UNSUPPORTED)
  }
  return {
    platform: process.platform,
    homeDir: homedir(),
    uid: process.getuid?.() ?? 0,
    path: process.env.PATH ?? '/usr/bin:/bin',
    userDataPath,
    defaultUserDataPath: getPlatformUserDataPath(process.platform, homedir()),
    run: defaultCommandRunner
  }
}

/** The service waits for its tokens instead of exiting, so launchd/systemd do not loop on it. */
export async function readStoredBridgeTokens(
  userDataPath: string,
  signal: AbortSignal
): Promise<SlackTokens | null> {
  const deps = slackServiceDeps(userDataPath)
  while (!signal.aborted) {
    try {
      const tokens = await readSlackServiceTokens(deps)
      if (tokens) {
        return tokens
      }
      console.error('[slack-bridge] no stored Slack tokens; reconnect the bot in the app')
    } catch (error) {
      console.error('[slack-bridge]', error instanceof Error ? error.message : error)
    }
    await delayUnlessAborted(60_000, signal)
  }
  return null
}
