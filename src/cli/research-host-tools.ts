import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import {
  chmod,
  cp,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { promisify } from 'node:util'
import {
  NODE_RUNTIME_ASSETS,
  NODE_RUNTIME_COMPAT_ASSETS,
  NODE_RUNTIME_PIN,
  nodeRuntimeReleaseUrl
} from '../shared/node-runtime-pin'
import { resolveExecutableCommand } from '../shared/node-cli-command-resolution'
import { quotePosixShell } from '../shared/shell-argument-quoting'
import type { ResearchHostToolsStatus } from '../shared/research-host-tools-status'
import { downloadVerified } from './research-tool-download'

const runFile = promisify(execFile)
const TECTONIC_VERSION = '0.17.0'
const TECTONIC: Record<string, { file: string; sha256: string }> = {
  'darwin-arm64': {
    file: 'tectonic-0.17.0-aarch64-apple-darwin.tar.gz',
    sha256: 'a3f1cac7c5678f01661a92212f58480ae3b0634115d880dbc59e2953ded45667'
  },
  'darwin-x64': {
    file: 'tectonic-0.17.0-x86_64-apple-darwin.tar.gz',
    sha256: '7c90ef5b6ddb1eb1937e4337add5237b79338e4b9676459fa91187d24d6cdf80'
  },
  'linux-arm64': {
    file: 'tectonic-0.17.0-aarch64-unknown-linux-musl.tar.gz',
    sha256: 'b10954a95404f3ab2328d2fa59a5ebab8e657f893fab096f98be8db7c0c979b8'
  },
  'linux-x64-glibc': {
    file: 'tectonic-0.17.0-x86_64-unknown-linux-gnu.tar.gz',
    sha256: '1a715688baf591e650c8aeb160ae934e181685eecbb38b317de30b269ac5d606'
  },
  'linux-x64-musl': {
    file: 'tectonic-0.17.0-x86_64-unknown-linux-musl.tar.gz',
    sha256: '8533d07f9ccbd7a65824b9e0459041bca34af1eb33daba48f59215593753a3b7'
  }
}

export function researchToolsBin(userDataPath: string): string {
  return join(userDataPath, 'research-tools', 'bin')
}

function toolStatus(
  userDataPath: string,
  state: ResearchHostToolsStatus['state'],
  detail: string | null
): ResearchHostToolsStatus {
  const bin = researchToolsBin(userDataPath)
  return {
    state,
    node: existsSync(process.execPath),
    npm: Boolean(resolveExecutableCommand('npm') || existsSync(join(bin, 'npm'))),
    pdf: Boolean(
      resolveExecutableCommand('tectonic') ||
      resolveExecutableCommand('latexmk') ||
      existsSync(join(bin, 'tectonic'))
    ),
    detail
  }
}

function statusPath(userDataPath: string): string {
  return join(userDataPath, 'research-tools', 'status.json')
}

async function saveStatus(userDataPath: string, status: ResearchHostToolsStatus): Promise<void> {
  await mkdir(dirname(statusPath(userDataPath)), { recursive: true, mode: 0o700 })
  await writeFile(statusPath(userDataPath), JSON.stringify(status), { mode: 0o600 })
}

export async function readResearchHostToolsStatus(
  userDataPath: string
): Promise<ResearchHostToolsStatus> {
  let previousState: ResearchHostToolsStatus['state'] = 'preparing'
  let previousDetail: string | null = null
  try {
    const previous: unknown = JSON.parse(await readFile(statusPath(userDataPath), 'utf8'))
    if (previous && typeof previous === 'object') {
      const state = Reflect.get(previous, 'state')
      if (state === 'preparing' || state === 'ready' || state === 'error') {
        previousState = state
      }
      const detail = Reflect.get(previous, 'detail')
      if (typeof detail === 'string') {
        previousDetail = detail
      }
    }
  } catch {
    // A new SSH host has not started preparation yet.
  }
  const current = toolStatus(userDataPath, previousState, previousDetail)
  return previousState === 'ready' && current.npm && current.pdf
    ? { ...current, state: 'ready', detail: null }
    : current
}

async function runs(program: string | null, args: string[]): Promise<boolean> {
  if (!program) {
    return false
  }
  try {
    await runFile(program, args, { timeout: 15_000 })
    return true
  } catch {
    return false
  }
}

async function installNpm(userDataPath: string, stage: string): Promise<void> {
  const bundled = join(dirname(dirname(process.execPath)), 'lib', 'node_modules', 'npm')
  let target = bundled
  if (!existsSync(join(bundled, 'bin', 'npm-cli.js'))) {
    const marker = basename(dirname(dirname(process.execPath))).replace(/^node-/, '')
    const asset = [
      ...Object.values(NODE_RUNTIME_ASSETS),
      ...Object.values(NODE_RUNTIME_COMPAT_ASSETS)
    ].find((item) => item.executableSha256 === marker)
    if (!asset) {
      throw new Error('Could not identify the pinned Node archive needed to install npm')
    }
    const archive = join(stage, asset.archive)
    await downloadVerified(
      nodeRuntimeReleaseUrl(asset.source, asset.archive),
      asset.archiveSha256,
      archive
    )
    const prefix = asset.archive.replace(/\.tar\.gz$/, '')
    await runFile('tar', ['-xzf', archive, '-C', stage, `${prefix}/lib/node_modules/npm`], {
      timeout: 120_000
    })
    target = join(userDataPath, 'research-tools', 'npm', NODE_RUNTIME_PIN.version)
    await mkdir(dirname(target), { recursive: true, mode: 0o700 })
    if (!existsSync(target)) {
      const stagedNpm = await mkdtemp(join(dirname(target), '.npm-'))
      try {
        await cp(join(stage, prefix, 'lib', 'node_modules', 'npm'), stagedNpm, {
          recursive: true,
          force: true
        })
        if (!existsSync(target)) {
          try {
            await rename(stagedNpm, target)
          } catch (error) {
            if (!existsSync(target)) {
              throw error
            }
          }
        }
      } finally {
        await rm(stagedNpm, { recursive: true, force: true })
      }
    }
  }
  const bin = researchToolsBin(userDataPath)
  await mkdir(bin, { recursive: true, mode: 0o700 })
  await writeFile(
    join(bin, 'node'),
    `#!/bin/sh\nexec ${quotePosixShell(process.execPath)} "$@"\n`,
    { mode: 0o700 }
  )
  await chmod(join(bin, 'node'), 0o700)
  for (const [name, entry] of [
    ['npm', 'npm-cli.js'],
    ['npx', 'npx-cli.js']
  ] as const) {
    const file = join(bin, name)
    await writeFile(
      file,
      `#!/bin/sh\nexec ${quotePosixShell(process.execPath)} ${quotePosixShell(join(target, 'bin', entry))} "$@"\n`,
      { mode: 0o700 }
    )
    await chmod(file, 0o700)
  }
}

function tectonicAsset(): { file: string; sha256: string } {
  const report = process.report.getReport()
  const header = Reflect.get(report, 'header')
  const glibc =
    header && typeof header === 'object' ? Reflect.get(header, 'glibcVersionRuntime') : null
  const key =
    process.platform === 'linux'
      ? process.arch === 'arm64'
        ? 'linux-arm64'
        : `linux-x64-${glibc ? 'glibc' : 'musl'}`
      : `${process.platform}-${process.arch}`
  const asset = TECTONIC[key]
  if (!asset) {
    throw new Error(
      `Automatic PDF compiler setup is unavailable on ${process.platform}-${process.arch}`
    )
  }
  return asset
}

async function findTectonic(dir: string): Promise<string | null> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isFile() && entry.name === 'tectonic') {
      return path
    }
    if (entry.isDirectory()) {
      const nested = await findTectonic(path)
      if (nested) {
        return nested
      }
    }
  }
  return null
}

async function installTectonic(userDataPath: string, stage: string): Promise<void> {
  const asset = tectonicAsset()
  const archive = join(stage, asset.file)
  await downloadVerified(
    `https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%40${TECTONIC_VERSION}/${asset.file}`,
    asset.sha256,
    archive
  )
  const extract = join(stage, 'tectonic-extract')
  await mkdir(extract)
  await runFile('tar', ['-xzf', archive, '-C', extract], { timeout: 120_000 })
  const binary = await findTectonic(extract)
  if (!binary) {
    throw new Error('Tectonic archive contains no executable')
  }
  const bin = researchToolsBin(userDataPath)
  await mkdir(bin, { recursive: true, mode: 0o700 })
  const temporary = join(bin, `.tectonic-${process.pid}`)
  await copyFile(binary, temporary)
  await chmod(temporary, 0o700)
  await rename(temporary, join(bin, 'tectonic'))
}

export async function prepareResearchHostTools(
  userDataPath: string
): Promise<ResearchHostToolsStatus> {
  if (process.platform !== 'linux' && process.platform !== 'darwin') {
    const result = toolStatus(
      userDataPath,
      'error',
      'Automatic research tool setup requires a supported macOS or Linux SSH runtime'
    )
    await saveStatus(userDataPath, result)
    return result
  }
  await saveStatus(userDataPath, toolStatus(userDataPath, 'preparing', null))
  const stage = await mkdtemp(join(tmpdir(), 'aster-research-tools-'))
  try {
    const npm = resolveExecutableCommand('npm') ?? join(researchToolsBin(userDataPath), 'npm')
    if (!(await runs(npm, ['--version']))) {
      await installNpm(userDataPath, stage)
    }
    const tectonic =
      resolveExecutableCommand('tectonic') ?? join(researchToolsBin(userDataPath), 'tectonic')
    const latexmk = resolveExecutableCommand('latexmk')
    if (!(await runs(tectonic, ['--version'])) && !(await runs(latexmk, ['-v']))) {
      await installTectonic(userDataPath, stage)
    }
    if (
      !(await runs(join(researchToolsBin(userDataPath), 'npm'), ['--version'])) &&
      !(await runs(resolveExecutableCommand('npm'), ['--version']))
    ) {
      throw new Error('npm did not run after setup')
    }
    if (
      !(await runs(join(researchToolsBin(userDataPath), 'tectonic'), ['--version'])) &&
      !(await runs(resolveExecutableCommand('tectonic'), ['--version'])) &&
      !(await runs(resolveExecutableCommand('latexmk'), ['-v']))
    ) {
      throw new Error('The PDF compiler did not run after setup')
    }
    const result = toolStatus(userDataPath, 'ready', null)
    await saveStatus(userDataPath, result)
    return result
  } catch (error) {
    const result = toolStatus(
      userDataPath,
      'error',
      error instanceof Error ? error.message : String(error)
    )
    await saveStatus(userDataPath, result)
    return result
  } finally {
    await rm(stage, { recursive: true, force: true })
  }
}
