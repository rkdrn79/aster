import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { runProcess } from '@orca/process-host'
import { PRODUCT_BRAND } from '../shared/product-brand'
import { writeSecureFile } from '../shared/secure-file'
import { serviceProfileSuffix } from './runtime/serve-service-unit'

export type SlackTokens = { appToken: string; botToken: string }

export type CommandRunner = (
  program: string,
  args: readonly string[],
  options?: { input?: string }
) => Promise<{ code: number | null; stdout: string; stderr: string }>

export const defaultCommandRunner: CommandRunner = async (program, args, options) => {
  try {
    const result = await runProcess({ program, args, input: options?.input, timeoutMs: 20_000 })
    return {
      code: result.timedOut ? null : result.code,
      stdout: result.stdout,
      stderr: result.stderr
    }
  } catch (error) {
    return {
      code: null,
      stdout: '',
      stderr: error instanceof Error ? error.message : String(error)
    }
  }
}

export type SlackTokenStoreDeps = {
  platform: NodeJS.Platform
  userDataPath: string
  defaultUserDataPath: string
  run: CommandRunner
}

const SECURITY = '/usr/bin/security'
/** errSecItemNotFound, as `security` reports it. */
const KEYCHAIN_NOT_FOUND = 44
// Why strict: values travel on a `security -i` command line, which has its own quoting rules.
const TOKEN_PATTERNS = { appToken: /^xapp-[A-Za-z0-9-]+$/, botToken: /^xoxb-[A-Za-z0-9-]+$/ }
const ACCOUNTS = { appToken: 'app-token', botToken: 'bot-token' } as const

export function slackTokenStoreKind(platform: NodeJS.Platform): 'keychain' | 'file' | null {
  return platform === 'darwin' ? 'keychain' : platform === 'linux' ? 'file' : null
}

/** Login Keychain service name: the product's app ID, plus a suffix for non-default profiles. */
export function slackKeychainService(
  deps: Pick<SlackTokenStoreDeps, 'userDataPath' | 'defaultUserDataPath'>
): string {
  const suffix = serviceProfileSuffix(deps)
  return `${PRODUCT_BRAND.appId}.slack-bridge${suffix ? `.${suffix}` : ''}`
}

/** Linux keeps the tokens in an owner-only file inside the profile (under ~/.config by default). */
export function slackTokenFilePath(userDataPath: string): string {
  return join(userDataPath, 'slack', 'service-tokens-v1.json')
}

function storeKind(platform: NodeJS.Platform): 'keychain' | 'file' {
  const kind = slackTokenStoreKind(platform)
  if (!kind) {
    throw new Error('The background Slack service is not available on Windows yet.')
  }
  return kind
}

function checkedTokens(tokens: SlackTokens): SlackTokens {
  if (
    !TOKEN_PATTERNS.appToken.test(tokens.appToken) ||
    !TOKEN_PATTERNS.botToken.test(tokens.botToken)
  ) {
    throw new Error('Slack tokens must be Slack-issued xapp- and xoxb- tokens')
  }
  return tokens
}

async function readKeychainItem(
  deps: SlackTokenStoreDeps,
  account: string
): Promise<string | null> {
  const result = await deps.run(SECURITY, [
    'find-generic-password',
    '-s',
    slackKeychainService(deps),
    '-a',
    account,
    '-w'
  ])
  if (result.code === KEYCHAIN_NOT_FOUND) {
    return null
  }
  if (result.code !== 0) {
    throw new Error(
      `Could not read the Slack token from the login Keychain (${result.code ?? 'timeout'})`
    )
  }
  return result.stdout.trim() || null
}

export async function writeSlackServiceTokens(
  tokens: SlackTokens,
  deps: SlackTokenStoreDeps
): Promise<void> {
  checkedTokens(tokens)
  if (storeKind(deps.platform) === 'file') {
    if (
      !writeSecureFile(
        slackTokenFilePath(deps.userDataPath),
        JSON.stringify({ version: 1, ...tokens }),
        { durable: true }
      )
    ) {
      throw new Error('Slack tokens could not be saved with owner-only file permissions')
    }
    return
  }
  const service = slackKeychainService(deps)
  for (const key of ['appToken', 'botToken'] as const) {
    // Why stdin (`security -i`): a -w argument would put the token in the process list.
    await deps.run(SECURITY, ['-i'], {
      input: `add-generic-password -U -s ${service} -a ${ACCOUNTS[key]} -w ${tokens[key]}\n`
    })
    // Why read back: `security -i` can exit 0 when the command inside it failed.
    if ((await readKeychainItem(deps, ACCOUNTS[key])) !== tokens[key]) {
      throw new Error('Slack tokens could not be saved in the login Keychain')
    }
  }
}

export async function readSlackServiceTokens(
  deps: SlackTokenStoreDeps
): Promise<SlackTokens | null> {
  if (storeKind(deps.platform) === 'file') {
    let parsed: unknown
    try {
      parsed = JSON.parse(readFileSync(slackTokenFilePath(deps.userDataPath), 'utf8'))
    } catch (error) {
      if (error instanceof Error && Reflect.get(error, 'code') === 'ENOENT') {
        return null
      }
      throw error
    }
    const appToken = parsed && typeof parsed === 'object' ? Reflect.get(parsed, 'appToken') : null
    const botToken = parsed && typeof parsed === 'object' ? Reflect.get(parsed, 'botToken') : null
    if (typeof appToken !== 'string' || typeof botToken !== 'string') {
      throw new Error(`Unreadable Slack token file at ${slackTokenFilePath(deps.userDataPath)}`)
    }
    return checkedTokens({ appToken, botToken })
  }
  const appToken = await readKeychainItem(deps, ACCOUNTS.appToken)
  const botToken = await readKeychainItem(deps, ACCOUNTS.botToken)
  return appToken && botToken ? checkedTokens({ appToken, botToken }) : null
}

export async function deleteSlackServiceTokens(deps: SlackTokenStoreDeps): Promise<void> {
  if (storeKind(deps.platform) === 'file') {
    rmSync(slackTokenFilePath(deps.userDataPath), { force: true })
    return
  }
  for (const account of Object.values(ACCOUNTS)) {
    const result = await deps.run(SECURITY, [
      'delete-generic-password',
      '-s',
      slackKeychainService(deps),
      '-a',
      account
    ])
    if (result.code !== 0 && result.code !== KEYCHAIN_NOT_FOUND) {
      throw new Error('Slack tokens could not be removed from the login Keychain')
    }
  }
}
