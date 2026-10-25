import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import productBrand from '../../src/shared/product-brand.json' with { type: 'json' }
import { prepareDevCliTerminalWrappers } from './dev-cli-terminal-wrapper.mjs'

const cliName = productBrand.cliName
const devCliName = `${cliName}-dev`

describe('dev CLI terminal wrappers', () => {
  it('writes profile-scoped Windows wrappers for worker terminals', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'orca-dev-terminal-wrapper-'))
    const userDataPath = path.join(root, 'profile')
    prepareDevCliTerminalWrappers({
      repoRoot: root,
      userDataPath,
      electronExecutable: path.join(root, 'electron.exe'),
      platform: 'win32'
    })

    const wrapper = readFileSync(path.join(userDataPath, 'cli', 'bin', `${devCliName}.cmd`), 'utf8')
    expect(wrapper).toContain(`set "ORCA_USER_DATA_PATH=${userDataPath}"`)
    expect(wrapper).toContain('set "ORCA_DEV_CLI_INVOCATION=1"')
    expect(wrapper).toContain(`node "${path.join(root, 'out', 'cli', 'index.js')}" %*`)
    expect(readFileSync(path.join(userDataPath, 'cli', 'bin', `${cliName}.cmd`), 'utf8')).toBe(
      wrapper
    )
    expect(readFileSync(path.join(root, 'out', 'bin', `${devCliName}.cmd`), 'utf8')).toBe(wrapper)
    expect(readFileSync(path.join(root, 'out', 'bin', `${cliName}.cmd`), 'utf8')).toBe(wrapper)
  })

  it('escapes literal percent signs in every Windows batch path', () => {
    const root = path.join(mkdtempSync(path.join(tmpdir(), 'orca-dev-terminal-wrapper-')), '%repo%')
    const userDataPath = path.join(root, '%profile%')
    const electronExecutable = path.join(root, '%electron%', 'electron.exe')
    prepareDevCliTerminalWrappers({
      repoRoot: root,
      userDataPath,
      electronExecutable,
      platform: 'win32'
    })

    const wrapper = readFileSync(path.join(userDataPath, 'cli', 'bin', `${devCliName}.cmd`), 'utf8')
    expect(wrapper).toContain(`set "ORCA_USER_DATA_PATH=${userDataPath.replaceAll('%', '%%')}"`)
    expect(wrapper).toContain(
      `set "ORCA_APP_EXECUTABLE=${electronExecutable.replaceAll('%', '%%')}"`
    )
    expect(wrapper).toContain(
      `node "${path.join(root, 'out', 'cli', 'index.js').replaceAll('%', '%%')}" %*`
    )
    expect(readFileSync(path.join(root, 'out', 'bin', `${devCliName}.cmd`), 'utf8')).toBe(wrapper)
    expect(readFileSync(path.join(root, 'out', 'bin', `${cliName}.cmd`), 'utf8')).toBe(wrapper)
  })

  it('writes executable-style POSIX wrappers with the same profile identity', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'orca-dev-terminal-wrapper-'))
    const userDataPath = path.join(root, 'profile')
    prepareDevCliTerminalWrappers({
      repoRoot: root,
      userDataPath,
      electronExecutable: path.join(root, 'electron'),
      platform: 'linux'
    })

    const wrapper = readFileSync(path.join(userDataPath, 'cli', 'bin', devCliName), 'utf8')
    expect(wrapper).toContain(`export ORCA_USER_DATA_PATH=${JSON.stringify(userDataPath)}`)
    expect(wrapper).toContain('export ORCA_DEV_CLI_INVOCATION=1')
    expect(wrapper).toContain(
      `exec node ${JSON.stringify(path.join(root, 'out', 'cli', 'index.js'))}`
    )
    expect(readFileSync(path.join(userDataPath, 'cli', 'bin', cliName), 'utf8')).toBe(wrapper)
    expect(readFileSync(path.join(root, 'out', 'bin', devCliName), 'utf8')).toBe(wrapper)
    expect(readFileSync(path.join(root, 'out', 'bin', cliName), 'utf8')).toBe(wrapper)
  })
})
