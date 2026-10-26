import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { slackTokenFilePath } from '../../cli/slack-token-store'
import {
  disableSlackBackground,
  enableSlackBackground,
  readSlackBackgroundConfig,
  type SlackBackgroundHost
} from './research-slack-background'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

function host(failBridge = false): { value: SlackBackgroundHost; calls: string[] } {
  const homeDir = mkdtempSync(join(tmpdir(), 'aster-slack-background-'))
  roots.push(homeDir)
  const bin = join(homeDir, 'bin')
  mkdirSync(bin)
  const launcher = join(bin, 'aster')
  writeFileSync(launcher, '#!/bin/sh\n')
  chmodSync(launcher, 0o755)
  const userDataPath = join(homeDir, 'profile')
  const calls: string[] = []
  return {
    value: {
      platform: 'linux',
      homeDir,
      uid: 501,
      path: bin,
      userDataPath,
      defaultUserDataPath: userDataPath,
      env: { PATH: bin, ORCA_USER_DATA_PATH: userDataPath, ELECTRON_RUN_AS_NODE: '1' },
      isPackaged: true,
      command: () => launcher,
      run: async (program, args) => {
        const line = [program, ...args].join(' ')
        calls.push(line)
        if (failBridge && line.startsWith('systemctl --user restart aster-slack-bridge')) {
          return { code: 5, stdout: '', stderr: 'service denied' }
        }
        return { code: 0, stdout: '', stderr: '' }
      }
    },
    calls
  }
}

const tokens = { appToken: 'xapp-123-abc', botToken: 'xoxb-456-def' }

describe('desktop Slack background handoff', () => {
  it('installs both per-user services and cleans only the services it owns', async () => {
    const { value, calls } = host()
    const config = await enableSlackBackground(
      value,
      tokens,
      join(value.userDataPath, 'slack', 'connection-v1.json')
    )
    expect(config).toMatchObject({ enabled: true, installedRuntime: true })
    expect(readSlackBackgroundConfig(value.userDataPath)).toEqual(config)
    expect(existsSync(slackTokenFilePath(value.userDataPath))).toBe(true)
    expect(
      readFileSync(
        join(value.homeDir, '.config', 'systemd', 'user', 'aster-slack-bridge.service'),
        'utf8'
      )
    ).not.toContain('xoxb-')
    expect(
      calls.some((line) => /^systemctl --user restart orca-serve-[0-9a-f]{8}\.service$/.test(line))
    ).toBe(true)
    expect(
      calls.some((line) => line === 'systemctl --user restart aster-slack-bridge.service')
    ).toBe(true)
    await disableSlackBackground(value)
    expect(readSlackBackgroundConfig(value.userDataPath).enabled).toBe(false)
    expect(existsSync(slackTokenFilePath(value.userDataPath))).toBe(false)
    expect(
      existsSync(join(value.homeDir, '.config', 'systemd', 'user', 'aster-slack-bridge.service'))
    ).toBe(false)
  })

  it('rolls back a failed bridge install without leaving tokens or a runtime behind', async () => {
    const { value, calls } = host(true)
    await expect(enableSlackBackground(value, tokens, '/project/routes.json')).rejects.toThrow(
      'service denied'
    )
    expect(readSlackBackgroundConfig(value.userDataPath).enabled).toBe(false)
    expect(existsSync(slackTokenFilePath(value.userDataPath))).toBe(false)
    expect(
      calls.some((line) =>
        /^systemctl --user disable --now orca-serve-[0-9a-f]{8}\.service$/.test(line)
      )
    ).toBe(true)
  })

  it('refuses an unpackaged build before creating any files', async () => {
    const { value } = host()
    value.isPackaged = false
    await expect(enableSlackBackground(value, tokens, '/project/routes.json')).rejects.toThrow(
      'Development builds'
    )
    expect(existsSync(slackTokenFilePath(value.userDataPath))).toBe(false)
  })
})
