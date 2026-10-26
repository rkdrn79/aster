#!/usr/bin/env node
// Smoke-tests an unpacked or installed Windows package: bundled CLI, bundled research
// harness, PE branding, and a hidden 30s launch. Node built-ins only: CI runs it without
// node_modules, against the artifact rather than a source build.

import { spawn, spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

const repoRoot = resolve(import.meta.dirname, '..', '..')
const brand = JSON.parse(readFileSync(join(repoRoot, 'src/shared/product-brand.json'), 'utf8'))
const { version } = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'))

const { values: options } = parseArgs({
  options: {
    'app-dir': { type: 'string' },
    'report-dir': { type: 'string', default: 'smoke-report' },
    'launch-seconds': { type: 'string', default: '30' },
    'cli-only': { type: 'boolean', default: false }
  }
})
if (!options['app-dir']) {
  console.error('usage: packaged-app-smoke.mjs --app-dir DIR [--report-dir DIR] [--cli-only]')
  process.exit(2)
}

const appDir = resolve(options['app-dir'])
const resources = join(appDir, 'resources')
const reportDir = resolve(options['report-dir'])
mkdirSync(reportDir, { recursive: true })
const isWindows = process.platform === 'win32'
const exeSuffix = isWindows ? '.exe' : ''
const results = []

async function check(name, run) {
  const started = Date.now()
  try {
    const detail = await run()
    results.push({ name, ok: true, ms: Date.now() - started })
    console.log(`ok   ${name}${detail ? ` -- ${detail}` : ''}`)
  } catch (error) {
    results.push({
      name,
      ok: false,
      ms: Date.now() - started,
      error: String(error?.message ?? error)
    })
    console.log(`FAIL ${name}\n     ${String(error?.stack ?? error).replaceAll('\n', '\n     ')}`)
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function run(program, args, extra = {}) {
  const result = spawnSync(program, args, {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 120_000,
    ...extra,
    env: { ...process.env, ...extra.env }
  })
  if (result.error) {
    throw result.error
  }
  return result
}

function expectExit(result, label, code = 0) {
  assert(
    result.status === code,
    `${label} exited ${result.status}\nstdout: ${result.stdout?.slice(-2000)}\nstderr: ${result.stderr?.slice(-2000)}`
  )
  return result
}

function samePath(left, right) {
  const a = resolve(left)
  const b = resolve(right)
  return isWindows ? a.toLowerCase() === b.toLowerCase() : a === b
}

const appExecutableName = readFileSync(join(resources, 'app-executable-name'), 'utf8').trim()
const appExe = join(
  appDir,
  appExecutableName.endsWith('.exe') ? appExecutableName : `${appExecutableName}${exeSuffix}`
)
const cliLauncher = join(resources, 'bin', `${brand.cliName}${exeSuffix}`)
const cliShim = join(resources, 'bin', `${brand.cliName}.cmd`)
const harnessCli = join(resources, 'research-harness', 'cli.mjs')

await check('package layout', () => {
  const required = [
    appExe,
    join(resources, 'app.asar'),
    cliLauncher,
    harnessCli,
    join(resources, 'research-harness', 'loop', 'SKILL.md'),
    join(resources, brand.licenseNoticeFile)
  ]
  if (isWindows) {
    required.push(
      cliShim,
      join(resources, 'bin', 'orca-agent-hook.exe'),
      join(resources, 'bin', 'orca-administrator-restart.exe')
    )
  }
  const missing = required.filter((file) => !existsSync(file))
  assert(missing.length === 0, `missing: ${missing.join(', ')}`)
  return `${appExecutableName} ${(statSync(join(resources, 'app.asar')).size / 1e6).toFixed(1)} MB asar`
})

if (isWindows) {
  await check('PE branding', () => {
    const files = [
      appExe,
      cliLauncher,
      ...['orca-agent-hook.exe', 'orca-administrator-restart.exe'].map((name) =>
        join(resources, 'bin', name)
      )
    ]
    const script =
      '$env:SMOKE_FILES -split [IO.Path]::PathSeparator | ForEach-Object { [Diagnostics.FileVersionInfo]::GetVersionInfo($_) | Select-Object FileName,ProductName,FileDescription,CompanyName,ProductVersion } | ConvertTo-Json -Compress'
    const result = expectExit(
      run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
        env: { SMOKE_FILES: files.join(';') }
      }),
      'FileVersionInfo'
    )
    const infos = [JSON.parse(result.stdout)].flat()
    writeFileSync(join(reportDir, 'pe-version-info.json'), JSON.stringify(infos, null, 2))
    const wrong = infos.filter(
      (info) =>
        info.ProductName !== brand.name ||
        info.CompanyName !== brand.copyrightHolder ||
        /orca|stably/i.test(info.FileDescription)
    )
    assert(wrong.length === 0, `unbranded PE metadata: ${JSON.stringify(wrong)}`)
    return infos.map((info) => `${info.FileDescription}`).join(', ')
  })
}

await check('CLI --version (native launcher)', () => {
  const result = expectExit(run(cliLauncher, ['--version']), `${brand.cliName} --version`)
  assert(
    result.stdout.trim() === version,
    `expected ${version}, got ${JSON.stringify(result.stdout)}`
  )
  return result.stdout.trim()
})

if (isWindows) {
  await check('CLI --version (.cmd shim)', () => {
    // Why cmd.exe: Node refuses to spawn a .cmd directly, and this is how a terminal reaches it.
    const result = expectExit(
      // /s strips the outer quote pair, so a shim path with spaces keeps its own quotes.
      run(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `""${cliShim}" --version"`], {
        windowsVerbatimArguments: true
      }),
      `${brand.cliName}.cmd --version`
    )
    assert(
      result.stdout.trim() === version,
      `expected ${version}, got ${JSON.stringify(result.stdout)}`
    )
  })
}

await check('CLI --help', () => {
  const result = expectExit(run(cliLauncher, ['--help']), `${brand.cliName} --help`)
  const research = expectExit(
    run(cliLauncher, ['research', '--help']),
    `${brand.cliName} research --help`
  )
  writeFileSync(join(reportDir, 'cli-help.txt'), `${result.stdout}\n${research.stdout}`)
  assert(result.stdout.includes(`Usage: ${brand.cliName}`), 'help does not name the CLI')
  assert(research.stdout.includes('harness-path'), 'research help does not list harness-path')
  return `${result.stdout.split('\n').length} lines`
})

await check('CLI research harness-path', () => {
  const result = expectExit(run(cliLauncher, ['research', 'harness-path']), 'research harness-path')
  assert(
    samePath(result.stdout.trim(), harnessCli),
    `got ${result.stdout.trim()}, expected ${harnessCli}`
  )
})

await check('research harness --help', () => {
  const result = expectExit(run(process.execPath, [harnessCli, '--help']), 'harness --help')
  assert(result.stdout.includes('Aster research project harness'), 'unexpected harness help')
})

await check('research harness init / experiment / run exec', () => {
  const project = mkdtempSync(join(tmpdir(), 'aster smoke project '))
  const harness = (...args) => {
    const result = expectExit(
      run(process.execPath, [harnessCli, ...args, '--project', project, '--json']),
      `harness ${args[0]}`
    )
    return JSON.parse(result.stdout)
  }
  // A git project exercises HEAD/dirty/code.patch capture through git.exe.
  for (const args of [
    ['init', '-q'],
    [
      '-c',
      'user.email=smoke@aster.invalid',
      '-c',
      'user.name=smoke',
      'commit',
      '-q',
      '--allow-empty',
      '-m',
      'seed'
    ]
  ]) {
    expectExit(run('git', args, { cwd: project }), `git ${args[0]}`)
  }
  assert(harness('init').ok, 'init failed')
  const experiment = harness('experiment', '--name', 'Windows smoke')
  assert(experiment.slug === 'windows-smoke', `unexpected slug ${experiment.slug}`)
  const metricLine = 'ASTER_METRIC {"step":1,"metrics":{"loss":0.5}}'
  const exec = expectExit(
    run(process.execPath, [
      harnessCli,
      'run',
      'exec',
      '--experiment',
      'windows-smoke',
      '--project',
      project,
      '--json',
      '--',
      'node',
      '-e',
      `console.log(${JSON.stringify(metricLine)})`
    ]),
    'run exec'
  )
  const outcome = JSON.parse(exec.stdout)
  writeFileSync(join(reportDir, 'harness-run-exec.json'), JSON.stringify(outcome, null, 2))
  assert(outcome.state === 'succeeded' && outcome.exitCode === 0, `run state ${outcome.state}`)
  assert(outcome.code?.commit, 'run did not capture the git commit')
  const events = readFileSync(outcome.paths.metrics, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
  assert(
    events.length === 1 && events[0].step === 1 && events[0].metrics.loss === 0.5,
    `metrics.jsonl: ${JSON.stringify(events)}`
  )
  assert(
    readFileSync(outcome.paths.log, 'utf8').includes(metricLine),
    'train.log is missing the command output'
  )
  const listed = harness('run', 'list')
  assert(JSON.stringify(listed).includes(outcome.runId), 'run list does not include the run')
  const validation = run(process.execPath, [harnessCli, 'validate', '--project', project, '--json'])
  writeFileSync(join(reportDir, 'harness-validate.json'), validation.stdout)
  expectExit(validation, 'validate')
  return `${outcome.ref} loss=${events[0].metrics.loss}`
})

if (!options['cli-only']) {
  await check(`hidden launch for ${options['launch-seconds']}s`, () =>
    launchHidden(Number(options['launch-seconds']))
  )
}

writeFileSync(join(reportDir, 'results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((result) => !result.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length > 0 ? 1 : 0)

async function launchHidden(seconds) {
  const port = 9333
  const launchedAt = Date.now()
  const logPath = join(reportDir, 'app-output.log')
  const out = openSync(logPath, 'w')
  // Why a file, not a pipe: the terminal daemon inherits stdio and would hold a pipe open.
  const child = spawn(appExe, [`--remote-debugging-port=${port}`], {
    stdio: ['ignore', out, out],
    windowsHide: true,
    env: { ...process.env, ORCA_BACKGROUND_LAUNCH: '1', ELECTRON_ENABLE_LOGGING: '1' }
  })
  let exit = null
  child.on('exit', (code, signal) => {
    exit = { code, signal, afterMs: Date.now() - launchedAt }
  })
  const deadline = launchedAt + seconds * 1000
  let page = null
  try {
    page = await probeRenderer(port, launchedAt + Math.max(seconds, 60) * 1000, () => exit)
  } catch (error) {
    page = { error: String(error?.message ?? error) }
  }
  while (Date.now() < deadline && !exit) {
    await sleep(500)
  }
  const alive = exit === null
  if (alive && isWindows) {
    run('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'])
  } else if (alive) {
    child.kill('SIGTERM')
  }
  await sleep(2000)
  const logs = collectAppLogs(launchedAt)
  const crashDumps = findCrashDumps(launchedAt)
  const output = readFileSync(logPath, 'utf8')
  const fatal = [output, ...logs.map((log) => log.text)]
    .flatMap((text) => text.split('\n'))
    .filter((line) =>
      /:FATAL:|uncaughtException|Uncaught (?:Error|TypeError|ReferenceError)|"level":"fatal"/i.test(
        line
      )
    )
  writeFileSync(join(reportDir, 'renderer-probe.json'), JSON.stringify(page, null, 2))
  assert(
    alive,
    `app exited after ${exit?.afterMs}ms with ${exit?.code ?? exit?.signal}\n${output.slice(-3000)}`
  )
  assert(fatal.length === 0, `fatal log lines:\n${fatal.slice(0, 20).join('\n')}`)
  assert(!page?.error, `renderer probe failed: ${page?.error}`)
  assert(crashDumps.length === 0, `crash dumps were written: ${crashDumps.join(', ')}`)
  return `alive after ${seconds}s; title=${JSON.stringify(page.title)}; ${page.textLength} chars rendered; ${logs.length} log files`
}

async function probeRenderer(port, deadline, exited) {
  let targets = []
  while (Date.now() < deadline && !exited()) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      if (targets.some((target) => target.type === 'page')) {
        break
      }
    } catch {
      // Not listening yet.
    }
    await sleep(1000)
  }
  const pages = targets.filter((target) => target.type === 'page')
  if (pages.length === 0) {
    throw new Error(exited() ? 'app exited before a renderer appeared' : 'no renderer page target')
  }
  const session = await openCdp(pages[0].webSocketDebuggerUrl)
  try {
    let state = null
    // A fresh profile renders onboarding or the home view; wait until the React root has content.
    while (Date.now() < deadline && !exited()) {
      const response = await session.send('Runtime.evaluate', {
        expression:
          "JSON.stringify({ title: document.title, ready: document.readyState, url: location.href, textLength: (document.body?.innerText ?? '').length, text: (document.body?.innerText ?? '').slice(0, 600) })",
        returnByValue: true
      })
      state = JSON.parse(response.result?.result?.value ?? '{}')
      if (state.ready === 'complete' && state.textLength > 0) {
        break
      }
      await sleep(1000)
    }
    const shot = await session.send('Page.captureScreenshot', { format: 'png' }).catch(() => null)
    if (shot?.result?.data) {
      writeFileSync(join(reportDir, 'renderer.png'), Buffer.from(shot.result.data, 'base64'))
    }
    if (!state || state.textLength === 0) {
      throw new Error(`renderer never rendered content: ${JSON.stringify(state)}`)
    }
    return { ...state, targets: pages.map((target) => target.url) }
  } finally {
    session.close()
  }
}

function openCdp(url) {
  return new Promise((resolveSession, reject) => {
    const socket = new WebSocket(url)
    const pending = new Map()
    let nextId = 0
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data))
      pending.get(message.id)?.(message)
      pending.delete(message.id)
    })
    socket.addEventListener('error', () => reject(new Error(`CDP connection to ${url} failed`)))
    socket.addEventListener('open', () =>
      resolveSession({
        send: (method, params) =>
          new Promise((resolveMessage, rejectMessage) => {
            const id = ++nextId
            const timer = setTimeout(() => rejectMessage(new Error(`${method} timed out`)), 15_000)
            pending.set(id, (message) => {
              clearTimeout(timer)
              resolveMessage(message)
            })
            socket.send(JSON.stringify({ id, method, params }))
          }),
        close: () => socket.close()
      })
    )
  })
}

/** Log files the launch wrote under the profile; copied into the report for triage. */
function collectAppLogs(since) {
  const appData = isWindows ? process.env.APPDATA : null
  if (!appData) {
    return []
  }
  const logs = []
  for (const profile of [brand.name, brand.id]) {
    const logsDir = join(appData, profile, 'logs')
    if (!existsSync(logsDir)) {
      continue
    }
    for (const name of readdirSync(logsDir)) {
      const file = join(logsDir, name)
      if (statSync(file).isFile() && statSync(file).mtimeMs >= since - 5_000) {
        copyFileSync(file, join(reportDir, `profile-log-${name}`))
        logs.push({ name, text: readFileSync(file, 'utf8') })
      }
    }
    break
  }
  return logs
}

function findCrashDumps(since) {
  const appData = isWindows ? process.env.APPDATA : null
  const dumps = []
  const walk = (directory, depth) => {
    if (depth > 4 || !existsSync(directory)) {
      return
    }
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        walk(path, depth + 1)
      } else if (entry.name.endsWith('.dmp') && statSync(path).mtimeMs >= since) {
        dumps.push(path)
      }
    }
  }
  if (appData) {
    walk(join(appData, brand.name, 'Crashpad'), 0)
  }
  return dumps
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms))
}
