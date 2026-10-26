import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  deleteSlackServiceTokens,
  readSlackServiceTokens,
  slackTokenFilePath,
  writeSlackServiceTokens,
  type CommandRunner,
  type SlackTokenStoreDeps
} from './slack-token-store'

const tokens = { appToken: 'xapp-123-abc', botToken: 'xoxb-456-def' }
const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

function profile(): string {
  const root = mkdtempSync(join(tmpdir(), 'aster-slack-tokens-'))
  roots.push(root)
  return root
}

describe('Slack service token store', () => {
  it('keeps Linux tokens in an owner-only file and removes them', async () => {
    const userDataPath = profile()
    const deps: SlackTokenStoreDeps = {
      platform: 'linux',
      userDataPath,
      defaultUserDataPath: userDataPath,
      run: async () => {
        throw new Error('no external command expected')
      }
    }
    await writeSlackServiceTokens(tokens, deps)
    const path = slackTokenFilePath(userDataPath)
    if (process.platform !== 'win32') {
      expect(statSync(path).mode & 0o777).toBe(0o600)
    }
    expect(JSON.parse(readFileSync(path, 'utf8'))).toMatchObject({ version: 1, ...tokens })
    await expect(readSlackServiceTokens(deps)).resolves.toEqual(tokens)
    await deleteSlackServiceTokens(deps)
    await expect(readSlackServiceTokens(deps)).resolves.toBeNull()
  })

  it('uses a fake Keychain runner without putting token bytes in argv', async () => {
    const userDataPath = profile()
    const stored = new Map<string, string>()
    const calls: { args: readonly string[]; input?: string }[] = []
    const run: CommandRunner = async (_program, args, options) => {
      calls.push({ args, input: options?.input })
      if (args[0] === '-i') {
        const match = /-a (app-token|bot-token) -w (\S+)/.exec(options?.input ?? '')
        if (!match) {
          return { code: 1, stdout: '', stderr: '' }
        }
        stored.set(match[1], match[2])
        return { code: 0, stdout: '', stderr: '' }
      }
      const account = args[args.indexOf('-a') + 1]
      if (args[0] === 'delete-generic-password') {
        stored.delete(account)
        return { code: 0, stdout: '', stderr: '' }
      }
      return stored.has(account)
        ? { code: 0, stdout: `${stored.get(account)}\n`, stderr: '' }
        : { code: 44, stdout: '', stderr: '' }
    }
    const deps: SlackTokenStoreDeps = {
      platform: 'darwin',
      userDataPath,
      defaultUserDataPath: userDataPath,
      run
    }
    await writeSlackServiceTokens(tokens, deps)
    await expect(readSlackServiceTokens(deps)).resolves.toEqual(tokens)
    expect(
      calls.every(
        ({ args }) => !args.join(' ').includes('xapp-') && !args.join(' ').includes('xoxb-')
      )
    ).toBe(true)
    await deleteSlackServiceTokens(deps)
    await expect(readSlackServiceTokens(deps)).resolves.toBeNull()
  })

  it('rejects malformed tokens before storing them', async () => {
    const userDataPath = profile()
    const deps: SlackTokenStoreDeps = {
      platform: 'linux',
      userDataPath,
      defaultUserDataPath: userDataPath,
      run: async () => {
        throw new Error('no external command expected')
      }
    }
    await expect(
      writeSlackServiceTokens({ ...tokens, appToken: 'xapp-bad\nvalue' }, deps)
    ).rejects.toThrow()
    await expect(readSlackServiceTokens(deps)).resolves.toBeNull()
  })
})
