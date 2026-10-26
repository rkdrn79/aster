import { isAbsolute, resolve } from 'node:path'
import { CLI_NAME } from '../../shared/product-brand'
import type { CommandHandler } from '../dispatch'
import { getOptionalStringFlag, getRequiredStringFlag } from '../flags'
import { RuntimeClientError } from '../runtime/types'
import {
  installSlackBridgeService,
  readSlackBridgeServiceStatus,
  renderSlackBridgeService,
  uninstallSlackBridgeService
} from '../slack-bridge-service'
import { resolveSlackServiceCommand, slackServiceDeps as serviceDeps } from '../slack-service-host'
import {
  deleteSlackServiceTokens,
  readSlackServiceTokens,
  writeSlackServiceTokens
} from '../slack-token-store'
import { readProjectRoutes, requiredToken } from './slack'

/** The bridge flags the unit runs, checked here because the service has no terminal to fail in. */
function bridgeArgs(flags: Map<string, string | boolean>, cwd: string): string[] {
  const routesFile = getOptionalStringFlag(flags, 'routes-file')
  if (routesFile) {
    if (
      ['worktree', 'agent', 'allowed-users', 'allowed-channels'].some((flag) => flags.has(flag))
    ) {
      throw new RuntimeClientError(
        'invalid_argument',
        '--routes-file cannot be combined with single-workspace flags'
      )
    }
    const path = resolve(cwd, routesFile)
    readProjectRoutes(path)
    return ['--routes-file', path]
  }
  const worktree = getRequiredStringFlag(flags, 'worktree')
  if (
    worktree === 'active' ||
    worktree === 'current' ||
    (worktree.startsWith('path:') && !isAbsolute(worktree.slice(5)))
  ) {
    throw new RuntimeClientError(
      'invalid_argument',
      'A background service has no working directory; pass --worktree path:<absolute path> or another stable selector.'
    )
  }
  const channels = getOptionalStringFlag(flags, 'allowed-channels')
  return [
    '--worktree',
    worktree,
    '--agent',
    getRequiredStringFlag(flags, 'agent'),
    '--allowed-users',
    getRequiredStringFlag(flags, 'allowed-users'),
    ...(channels ? ['--allowed-channels', channels] : [])
  ]
}

function print(json: boolean, result: Record<string, unknown>, text: string): void {
  console.log(json ? JSON.stringify({ ok: true, result }, null, 2) : text)
}

export const SLACK_SERVICE_HANDLERS: Record<string, CommandHandler> = {
  'slack service install': async ({ flags, cwd, json }) => {
    const deps = serviceDeps()
    const args = bridgeArgs(flags, cwd)
    const command = resolveSlackServiceCommand(
      getOptionalStringFlag(flags, 'command') ?? null,
      deps
    )
    if (flags.get('dry-run') === true) {
      const spec = renderSlackBridgeService(deps, command, args)
      print(
        json,
        { installed: false, dryRun: true, ...spec },
        `Would write ${spec.unitPath}:\n\n${spec.content}`
      )
      return
    }
    const previousTokens = await readSlackServiceTokens(deps)
    await writeSlackServiceTokens(
      { appToken: requiredToken('SLACK_APP_TOKEN'), botToken: requiredToken('SLACK_BOT_TOKEN') },
      deps
    )
    const spec = await installSlackBridgeService(deps, command, args).catch(
      async (error: unknown) => {
        await (previousTokens
          ? writeSlackServiceTokens(previousTokens, deps)
          : deleteSlackServiceTokens(deps))
        throw error
      }
    )
    const status = await readSlackBridgeServiceStatus(deps)
    const lines = [`Installed ${spec.name} (${spec.manager}) at ${spec.unitPath}.`]
    if (spec.logPath) {
      lines.push(`Log: ${spec.logPath}`)
    }
    if (!status.runtimeInstalled) {
      lines.push(
        `No background runtime is installed for this profile. Run \`${CLI_NAME} serve service install\` so agents can answer while the app is closed.`
      )
    }
    print(
      json,
      { installed: true, ...spec, content: undefined, runtimeInstalled: status.runtimeInstalled },
      lines.join('\n')
    )
  },
  'slack service status': async ({ json }) => {
    const status = await readSlackBridgeServiceStatus(serviceDeps())
    const text = status.installed
      ? `${status.name}: ${status.verdict}${status.pid ? `, pid ${status.pid}` : ''} — ${status.detail}\nBackground runtime: ${status.runtimeInstalled ? 'installed' : 'not installed'}`
      : `${status.name} is not installed.`
    print(json, status, text)
  },
  'slack service uninstall': async ({ json }) => {
    const deps = serviceDeps()
    const removed = await uninstallSlackBridgeService(deps)
    await deleteSlackServiceTokens(deps)
    print(
      json,
      { removed },
      removed
        ? 'Removed the Slack bridge service and its stored tokens.'
        : 'The Slack bridge service was not installed; stored tokens were removed.'
    )
  }
}
