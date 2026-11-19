// A figure script must run on any computer that has Aster, not only the one it was written on, so
// it imports the kit through `<figures>/src/aster-figures-kit.mjs`: a small committed file that
// finds the harness at run time, with no path of this computer in it.
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

/** The shim's file name, in `<figures>/src/` beside the `<slug>.figure.mjs` scripts. */
export const KIT_SHIM = 'aster-figures-kit.mjs'
/** The import line a script beside the shim uses. */
export const KIT_SHIM_IMPORT = `import { openFigure } from './${KIT_SHIM}'`
const MARK = '// Written by Aster (figures new, figures run); rewritten when Aster changes it.'

/**
 * The shim's source: it loads the kit from $ASTER_HARNESS (the harness folder or its cli.mjs;
 * `figures run` sets it), else from the harness that last ran a figure on this computer (a
 * per-user note, ~/.cache/aster/harness), else from what `aster research harness-path` (or
 * $ORCA_CLI_COMMAND) prints, and re-exports the kit's names.
 */
export function kitShimText(names) {
  const exported = names.filter((name) => name !== 'default').toSorted()
  return `${MARK}
// Aster's figure kit, found on whatever computer runs the script. Scripts beside it import it:
//   ${KIT_SHIM_IMPORT}
// It looks in $ASTER_HARNESS (\`figures run\` sets it), then in the harness that last ran a
// figure on this computer (~/.cache/aster/harness), then asks \`aster research harness-path\`
// (or $ORCA_CLI_COMMAND). So \`node <slug>.figure.mjs\` runs directly after one figures run.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const KIT = 'research-figures-kit.mjs'

function askCli(command) {
  try {
    const printed = execFileSync(command, ['research', 'harness-path'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 30000,
      shell: process.platform === 'win32'
    })
    const cli = printed.trim().split('\\n').at(-1)
    return cli ? path.dirname(cli) : null
  } catch {
    return null
  }
}

function remembered() {
  try {
    return readFileSync(path.join(os.homedir(), '.cache', 'aster', 'harness'), 'utf8').trim() || null
  } catch {
    return null
  }
}

function harnessFolder() {
  const named = process.env.ASTER_HARNESS
  const candidates = [
    () => (named ? (named.endsWith('.mjs') ? path.dirname(named) : named) : null),
    () => remembered(),
    () => askCli('aster'),
    () => (process.env.ORCA_CLI_COMMAND ? askCli(process.env.ORCA_CLI_COMMAND) : null)
  ]
  for (const candidate of candidates) {
    const folder = candidate()
    if (folder && existsSync(path.join(folder, KIT))) {
      return folder
    }
  }
  throw new Error(
    "Aster's figure kit was not found: run the script once with \`node <H>/cli.mjs figures run --figure <slug>\` (later direct runs then find it), or set ASTER_HARNESS=<H>, the folder of the cli.mjs that \`aster research harness-path\` prints."
  )
}

export const harness = harnessFolder()
const kit = await import(pathToFileURL(path.join(harness, KIT)).href)
export default kit
export const {
${exported.map((name) => `  ${name}`).join(',\n')}
} = kit
`
}

/**
 * Writes `<folder>/src/aster-figures-kit.mjs` (project-relative `folder`) when it is missing or an
 * older one of Aster's; a shim the person replaced with their own stays.
 */
export async function ensureKitShim(project, folder) {
  const relative = `${folder}/src/${KIT_SHIM}`
  const file = path.join(project, relative)
  const kit = await import('./research-figures-kit.mjs')
  const text = kitShimText(Object.keys(kit))
  const current = await readFile(file, 'utf8').catch(() => null)
  if (current === null || (current !== text && current.startsWith(MARK))) {
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, text)
    return { path: relative, written: true }
  }
  return { path: relative, written: false }
}

/**
 * Notes `harness` in ~/.cache/aster/harness, so a figure script run directly with node (or a
 * measuring snippet) finds the kit without ASTER_HARNESS. Not under test runners: the note is
 * the person's.
 */
export async function rememberHarness(harness) {
  if (process.env.NODE_TEST_CONTEXT || process.env.VITEST) {
    return
  }
  const file = path.join(os.homedir(), '.cache', 'aster', 'harness')
  try {
    if ((await readFile(file, 'utf8').catch(() => '')).trim() !== harness) {
      await mkdir(path.dirname(file), { recursive: true })
      await writeFile(file, `${harness}\n`)
    }
  } catch {
    // Why ignored: a read-only home only loses the shortcut; ASTER_HARNESS still works.
  }
}

/** Runs a figure script with node, the kit taken from `harness`; its output and exit code. */
export function runFigureScript(project, script, { harness }) {
  void rememberHarness(harness)
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(project, script)], {
      cwd: project,
      env: { ...process.env, ASTER_HARNESS: harness },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => (stdout += chunk))
    child.stderr.on('data', (chunk) => (stderr += chunk))
    child.on('error', reject)
    child.on('close', (code) => resolve({ exitCode: code ?? 1, stdout, stderr }))
  })
}
