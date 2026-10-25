import { describe, expect, it } from 'vitest'
import { CLI_NAME, DEV_CLI_NAME, LINUX_CLI_NAME } from '../../src/shared/product-brand'
import {
  appendOrcaRpcOutput,
  resolveOrcaCliCommand,
  resolveOrcaCliInvocation
} from './live-remote-freeze-rpc.mjs'

describe('live remote freeze RPC', () => {
  it('resolves the Orca CLI for managed, dev, Linux, and default runtimes', () => {
    expect(resolveOrcaCliCommand({ env: { ORCA_CLI_COMMAND: 'custom-orca' } })).toBe('custom-orca')
    expect(resolveOrcaCliCommand({ env: { ORCA_DEV_REPO_ROOT: '/repo' } })).toBe(DEV_CLI_NAME)
    expect(resolveOrcaCliCommand({ env: {}, platform: 'linux' })).toBe(LINUX_CLI_NAME)
    expect(resolveOrcaCliCommand({ env: {}, platform: 'win32' })).toBe(CLI_NAME)
  })

  // The default dev command, its shim path, and the shim an older dev shell still names.
  it.each([
    undefined,
    `C:\\repo\\out\\bin\\${DEV_CLI_NAME}.cmd`,
    'C:\\repo\\out\\bin\\orca-dev.cmd'
  ])('bypasses the Windows dev cmd shim with the built Node CLI (%s)', (cliCommand) => {
    const invocation = resolveOrcaCliInvocation({
      env: {
        APPDATA: 'C:\\Users\\dev\\AppData\\Roaming',
        ...(cliCommand ? { ORCA_CLI_COMMAND: cliCommand } : {}),
        ORCA_DEV_REPO_ROOT: 'C:\\repo'
      },
      platform: 'win32',
      nodeExecutable: 'C:\\Program Files\\nodejs\\node.exe'
    })

    expect(invocation).toMatchObject({
      command: 'C:\\Program Files\\nodejs\\node.exe',
      prefixArgs: ['C:\\repo\\out\\cli\\index.js'],
      env: {
        ORCA_USER_DATA_PATH: 'C:\\Users\\dev\\AppData\\Roaming\\orca-dev',
        ORCA_DEV_CLI_INVOCATION: '1',
        ORCA_APP_EXECUTABLE: 'C:\\repo\\node_modules\\electron\\dist\\electron.exe',
        ORCA_APP_EXECUTABLE_NEEDS_APP_ROOT: '1'
      }
    })
  })

  it('caps combined asynchronous output before retaining the overflow chunk', () => {
    const first = appendOrcaRpcOutput('', '1234', 0, 5)
    expect(first).toEqual({ output: '1234', bytes: 4, exceeded: false })

    const overflow = appendOrcaRpcOutput(first.output, '67', first.bytes, 5)
    expect(overflow).toEqual({ output: '1234', bytes: 6, exceeded: true })
  })
})
