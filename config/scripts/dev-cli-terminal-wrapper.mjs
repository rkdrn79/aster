import { chmodSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import productBrand from '../../src/shared/product-brand.json' with { type: 'json' }

const cliName = productBrand.cliName
const commandNames = [`${cliName}-dev`, cliName]
// Why: wrappers an older build wrote under upstream names would otherwise stay on the dev PATH.
const legacyCommandNames = ['orca-dev', 'orca'].filter((name) => !commandNames.includes(name))

function escapeWindowsBatchValue(value) {
  // Why: cmd.exe expands %NAME% even inside quotes, so literal path percent signs must be doubled.
  return value.replaceAll('%', '%%')
}

export function prepareDevCliTerminalWrappers({
  repoRoot,
  userDataPath,
  electronExecutable,
  platform = process.platform
}) {
  const binDir = path.join(repoRoot, 'out', 'bin')
  const userDataBinDir = path.join(userDataPath, 'cli', 'bin')
  const cliPath = path.join(repoRoot, 'out', 'cli', 'index.js')
  mkdirSync(binDir, { recursive: true })
  mkdirSync(userDataBinDir, { recursive: true })

  if (platform === 'win32') {
    const wrapperContent = `@echo off\r\nset "ORCA_USER_DATA_PATH=${escapeWindowsBatchValue(userDataPath)}"\r\nset "ORCA_DEV_CLI_INVOCATION=1"\r\nset "ORCA_APP_EXECUTABLE=${escapeWindowsBatchValue(electronExecutable)}"\r\nset "ORCA_APP_EXECUTABLE_NEEDS_APP_ROOT=1"\r\nnode "${escapeWindowsBatchValue(cliPath)}" %*\r\n`
    for (const targetDir of [binDir, userDataBinDir]) {
      for (const commandName of commandNames) {
        writeFileSync(path.join(targetDir, `${commandName}.cmd`), wrapperContent, 'utf8')
      }
      for (const commandName of legacyCommandNames) {
        rmSync(path.join(targetDir, `${commandName}.cmd`), { force: true })
      }
    }
  } else {
    const wrapperContent = `#!/usr/bin/env bash\nexport ORCA_USER_DATA_PATH=${JSON.stringify(userDataPath)}\nexport ORCA_DEV_CLI_INVOCATION=1\nexport ORCA_APP_EXECUTABLE=${JSON.stringify(electronExecutable)}\nexport ORCA_APP_EXECUTABLE_NEEDS_APP_ROOT=1\nexec node ${JSON.stringify(cliPath)} "$@"\n`
    for (const targetDir of [binDir, userDataBinDir]) {
      for (const commandName of commandNames) {
        const wrapperPath = path.join(targetDir, commandName)
        writeFileSync(wrapperPath, wrapperContent, 'utf8')
        chmodSync(wrapperPath, 0o755)
      }
      for (const commandName of legacyCommandNames) {
        rmSync(path.join(targetDir, commandName), { force: true })
      }
    }
  }

  return { binDir, userDataBinDir }
}
