import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const OLD = '1.2.3+aaaa111'
const NEW = '1.2.4+bbbb222'
const SHA = 'e'.repeat(64)
const repoRoot = resolve(__dirname, '..', '..')
const followModule = pathToFileURL(join(__dirname, 'slack-bridge-update-follow.ts')).href

let root: string | null = null
afterEach(() => {
  if (root) {
    rmSync(root, { recursive: true, force: true })
    root = null
  }
})

function run(
  script: string,
  args: string[]
): Promise<{ code: number | null; lines: string[]; stderr: string }> {
  return new Promise((resolveRun, reject) => {
    // Why tsx: the child imports the real module, so the test covers the actual execve call.
    const child = spawn(process.execPath, ['--import', 'tsx', script, ...args], {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => (stdout += chunk))
    child.stderr.on('data', (chunk) => (stderr += chunk))
    child.once('error', reject)
    child.once('close', (code) =>
      resolveRun({ code, lines: stdout.split('\n').filter(Boolean), stderr })
    )
  })
}

describe.skipIf(typeof process.execve !== 'function' || process.platform === 'win32')(
  'bridge re-exec on a real process',
  () => {
    it('keeps its pid and runs the new slot CLI with the original arguments', async () => {
      root = mkdtempSync(join(tmpdir(), 'aster-bridge-exec-'))
      const slot = join(root, `orcad-${NEW}`)
      mkdirSync(join(slot, 'out', 'cli'), { recursive: true })
      writeFileSync(join(slot, '.runtime-node'), SHA)
      writeFileSync(
        join(slot, 'out', 'cli', 'index.js'),
        'console.log(JSON.stringify({ phase: "new", pid: process.pid, argv: process.argv.slice(2), entry: process.argv[1] }))\n'
      )
      mkdirSync(join(root, 'runtimes', `node-${SHA}`, 'bin'), { recursive: true })
      symlinkSync(process.execPath, join(root, 'runtimes', `node-${SHA}`, 'bin', 'node'))
      writeFileSync(
        join(root, 'orcad-active.json'),
        JSON.stringify({ schemaVersion: 1, active: NEW })
      )

      const script = join(root, 'old-bridge.mjs')
      writeFileSync(
        script,
        `import { planBridgeFollow, reexecBridge } from ${JSON.stringify(followModule)}
const plan = planBridgeFollow({ root: ${JSON.stringify(root)}, ownVersion: ${JSON.stringify(OLD)} })
console.log(JSON.stringify({ phase: 'old', pid: process.pid, action: plan.action }))
if (plan.action === 'reexec') {
  reexecBridge(plan, process.argv, process.env)
}
console.log(JSON.stringify({ phase: 'not-replaced', pid: process.pid }))
`
      )

      const args = ['slack', 'bridge', '--service', '--routes-file', '/tmp/routes.json']
      const result = await run(script, args)
      expect(result.stderr).toBe('')
      const [before, after, ...rest] = result.lines.map((line) => JSON.parse(line))
      expect(rest).toEqual([])
      expect(before).toMatchObject({ phase: 'old', action: 'reexec' })
      expect(after).toMatchObject({
        phase: 'new',
        argv: args,
        entry: join(slot, 'out', 'cli', 'index.js')
      })
      expect(after.pid).toBe(before.pid)
      expect(dirname(after.entry)).toBe(join(slot, 'out', 'cli'))
      expect(result.code).toBe(0)
    }, 20_000)
  }
)
