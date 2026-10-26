import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  installSlackBridgeService,
  readSlackBridgeServiceStatus,
  renderSlackBridgeService,
  uninstallSlackBridgeService,
  type SlackServiceDeps
} from './slack-bridge-service'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

function deps(platform: NodeJS.Platform): { value: SlackServiceDeps; calls: string[] } {
  const homeDir = mkdtempSync(join(tmpdir(), 'aster-slack-service-'))
  roots.push(homeDir)
  const calls: string[] = []
  return {
    value: {
      platform,
      homeDir,
      uid: 501,
      path: '/usr/local/bin:/usr/bin:/bin',
      userDataPath: join(homeDir, 'profile'),
      defaultUserDataPath: join(homeDir, 'profile'),
      run: async (program, args) => {
        calls.push([program, ...args].join(' '))
        if (program === 'launchctl' && args[0] === 'print') {
          return { code: 0, stdout: '\tstate = running\n\tpid = 1234\n', stderr: '' }
        }
        if (program === 'systemctl' && args[1] === 'show') {
          return {
            code: 0,
            stdout: 'ActiveState=active\nSubState=running\nMainPID=1234\n',
            stderr: ''
          }
        }
        return { code: 0, stdout: '', stderr: '' }
      }
    },
    calls
  }
}

describe('Slack bridge user service', () => {
  it('writes a token-free LaunchAgent and probes its actual process', async () => {
    const { value, calls } = deps('darwin')
    const spec = await installSlackBridgeService(value, '/Applications/Aster.app/aster', [
      '--routes-file',
      join(value.userDataPath, 'slack', 'connection-v1.json')
    ])
    const unit = readFileSync(spec.unitPath, 'utf8')
    expect(unit).toContain('<string>--service</string>')
    expect(unit).toContain('<key>ORCA_USER_DATA_PATH</key>')
    expect(unit).not.toContain('xapp-')
    expect(unit).not.toContain('xoxb-')
    expect(calls).toEqual([
      `launchctl bootout gui/501/${spec.name}`,
      `launchctl bootstrap gui/501 ${spec.unitPath}`
    ])
    await expect(readSlackBridgeServiceStatus(value)).resolves.toMatchObject({
      installed: true,
      verdict: 'live',
      pid: 1234
    })
    expect(await uninstallSlackBridgeService(value)).toBe(true)
    expect(existsSync(spec.unitPath)).toBe(false)
  })

  it('quotes the Linux command, depends on the runtime and refuses Windows', async () => {
    const { value, calls } = deps('linux')
    const spec = await installSlackBridgeService(value, '/opt/Aster App/aster', [
      '--routes-file',
      '/home/research/space & more/routes.json'
    ])
    expect(spec.content).toContain('ExecStart="/opt/Aster App/aster" slack bridge --routes-file')
    expect(spec.content).toContain('Wants=orca-serve.service')
    expect(spec.content).toContain('Restart=on-failure')
    expect(calls.slice(0, 3)).toEqual([
      'systemctl --user daemon-reload',
      `systemctl --user enable ${spec.name}`,
      `systemctl --user restart ${spec.name}`
    ])
    const windows = deps('win32').value
    expect(() => renderSlackBridgeService(windows, '/bin/aster', [])).toThrow('Windows')
  })

  it('removes a first-time unit when the service manager refuses to start it', async () => {
    const { value, calls } = deps('linux')
    value.run = async (program, args) => {
      const line = [program, ...args].join(' ')
      calls.push(line)
      return line.startsWith('systemctl --user restart aster-slack-bridge')
        ? { code: 5, stdout: '', stderr: 'service denied' }
        : { code: 0, stdout: '', stderr: '' }
    }
    const spec = renderSlackBridgeService(value, '/opt/aster', [])
    await expect(installSlackBridgeService(value, '/opt/aster', [])).rejects.toThrow(
      'service denied'
    )
    expect(existsSync(spec.unitPath)).toBe(false)
    expect(calls).toContain(`systemctl --user disable --now ${spec.name}`)
  })
})
