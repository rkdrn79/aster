#!/usr/bin/env node
// Deploys this relay to the user's own Cloudflare account and saves its URL where Aster reads it.
// Safe to run again: it keeps the saved key, skips sign-in when signed in, and redeploys in place.
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'

const CONFIG_DIR = join(homedir(), '.config', 'aster-relay')
const KEY_FILE = join(CONFIG_DIR, 'relay-key')
const URL_FILE = join(CONFIG_DIR, 'relay-url')
// Why a copy: the app's bundled relay is read-only, and npm install writes beside it.
const WORKER_DIR = join(CONFIG_DIR, 'worker')
const SOURCE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const WORKERS_DEV_URL = /https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.workers\.dev/i
const SKIPPED_ENTRIES = new Set(['node_modules', '.wrangler', '.dev.vars'])

function step(message) {
  console.log(`\n==> ${message}`)
}

function fail(message) {
  console.error(`\nSetup stopped: ${message}`)
  process.exit(1)
}

/** Runs npm/npx in the worker copy; Windows needs a shell to find their .cmd shims. */
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: WORKER_DIR,
    shell: process.platform === 'win32',
    stdio: options.stdio ?? 'inherit',
    input: options.input,
    encoding: 'utf8'
  })
  if (result.error) {
    fail(`could not start ${command}: ${result.error.message}`)
  }
  return result
}

function writePrivateFile(filePath, contents) {
  writeFileSync(filePath, contents, { mode: 0o600 })
  // Why chmod too: writeFileSync keeps an existing file's mode.
  if (process.platform !== 'win32') {
    chmodSync(filePath, 0o600)
  }
}

function copyWorker() {
  mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 })
  if (resolve(SOURCE_DIR) === resolve(WORKER_DIR)) {
    return
  }
  cpSync(SOURCE_DIR, WORKER_DIR, {
    recursive: true,
    filter: (source) =>
      !relative(SOURCE_DIR, source)
        .split(sep)
        .some((part) => SKIPPED_ENTRIES.has(part))
  })
}

function signIn() {
  const whoami = run('npx', ['wrangler', 'whoami'], { stdio: ['inherit', 'pipe', 'pipe'] })
  const output = `${whoami.stdout ?? ''}${whoami.stderr ?? ''}`
  if (whoami.status === 0 && !/not authenticated|not logged in/i.test(output)) {
    console.log('Already signed in to Cloudflare.')
    return
  }
  if (run('npx', ['wrangler', 'login']).status !== 0) {
    fail('Cloudflare sign-in did not finish. Run this setup again to retry.')
  }
}

async function deploy() {
  const piped = run('npx', ['wrangler', 'deploy'], { stdio: ['inherit', 'pipe', 'inherit'] })
  process.stdout.write(piped.stdout ?? '')
  const found = piped.status === 0 ? (piped.stdout ?? '').match(WORKERS_DEV_URL) : null
  if (found) {
    return found[0]
  }
  // Why again with a terminal: a first deploy may ask to register a workers.dev subdomain.
  console.log('\nDeploying again so Wrangler can ask its questions here.')
  if (run('npx', ['wrangler', 'deploy']).status !== 0) {
    fail('the deploy failed. Fix the error above, then run this setup again.')
  }
  const prompt = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await prompt.question('Paste the https://….workers.dev URL printed above: ')
  prompt.close()
  return answer.trim().match(WORKERS_DEV_URL)?.[0] ?? fail('that is not a workers.dev URL.')
}

function readOrCreateKey() {
  const saved = existsSync(KEY_FILE) ? readFileSync(KEY_FILE, 'utf8').trim() : ''
  if (saved) {
    console.log(`Keeping the key in ${KEY_FILE}.`)
    return saved
  }
  const key = randomBytes(32).toString('base64url')
  writePrivateFile(KEY_FILE, key)
  console.log(`Saved a new key to ${KEY_FILE}.`)
  return key
}

async function checkHealth(origin) {
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const response = await fetch(`${origin}/health`)
      if (response.ok) {
        console.log(`${origin}/health answered ok.`)
        return
      }
    } catch {
      // A new workers.dev name can take a few seconds to resolve.
    }
    await new Promise((done) => setTimeout(done, 3000))
  }
  console.log(`${origin}/health did not answer yet; it usually does within a minute.`)
}

step(`Copying the relay to ${WORKER_DIR}`)
copyWorker()
step('Installing the relay’s tools (npm install)')
if (run('npm', ['install', '--no-audit', '--no-fund']).status !== 0) {
  fail('npm install failed. Check your network and Node.js install, then run this again.')
}
step('Signing in to Cloudflare')
signIn()
step('Deploying the relay (free Workers plan)')
const origin = new URL(await deploy()).origin
step('Setting the relay key')
const key = readOrCreateKey()
// Why stdin: the key never appears in a process list or the terminal.
const secret = run('npx', ['wrangler', 'secret', 'put', 'RELAY_KEY'], {
  stdio: ['pipe', 'inherit', 'inherit'],
  input: key
})
if (secret.status !== 0) {
  fail('Wrangler could not store the key. Run this setup again to retry.')
}
step('Checking the relay')
await checkHealth(origin)
// Why last: Aster's Phone dialog fills in the URL as soon as this file appears.
writePrivateFile(URL_FILE, `wss://${new URL(origin).host}/ws?key=${key}\n`)
console.log(`\nDone. Your relay URL is saved in ${URL_FILE} (keep it private).`)
console.log('Back in Aster, the Phone dialog fills it in for you.')
