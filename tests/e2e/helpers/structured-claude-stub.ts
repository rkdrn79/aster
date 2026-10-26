// The fake Claude CLI fixture for structured chat specs, and creating a chat on the host.
import { randomUUID } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Page } from '@stablyai/playwright-test'
import { test as base, expect } from './orca-app'
import { buildFakeAgentCommandOverride } from './fake-agent-command-override'
import { resolveCliCommand } from '../../../src/shared/node-cli-command-resolution'
import { createStructuredAgentSessionId } from '../../../src/shared/structured-agent-session-create'
import {
  createStructuredAgentSessionOperationId,
  structuredAgentSessionCreateFingerprint
} from '../../../src/shared/structured-agent-session-mutation'

// Why skip Windows: specs that set `buildFakeAgentCommandOverride(claudeStub.command)` hand native
// chat a PowerShell call (`& '...'`), which it refuses; `claudeStub.override` works everywhere.
export const SUPPORTED = process.platform !== 'win32'
const STUB_SCRIPT = path.join(
  process.cwd(),
  'tests',
  'e2e',
  'fixtures',
  'structured-claude-stub.cjs'
)

const SYSTEM_DIRS = ['/usr/bin', '/bin', '/usr/sbin', '/sbin']

/** `override` is the Claude Command setting that starts the stub, for native chat on any host. */
export type ClaudeStub = { command: string; launchLog: string; override: string }

/** Dirs a login shell puts ahead of the launch PATH on macOS (path_helper). */
function macLoginShellPathDirs(): string[] {
  if (process.platform !== 'darwin') {
    return []
  }
  const files = [
    '/etc/paths',
    ...(existsSync('/etc/paths.d') ? readdirSync('/etc/paths.d') : []).map((name) =>
      path.join('/etc/paths.d', name)
    )
  ]
  return files.flatMap((file) => readFileSync(file, 'utf8').split('\n').filter(Boolean))
}

export const test = base.extend<{ claudeStub: ClaudeStub }>({
  // oxlint-disable-next-line no-empty-pattern -- Playwright fixture callbacks require object destructuring here.
  claudeStub: async ({}, provideFixture, testInfo) => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'orca-e2e-structured-claude-'))
    // Why .cmd on Windows: an extensionless file cannot start there; process-host runs .cmd shims.
    const command = path.join(dir, process.platform === 'win32' ? 'claude.cmd' : 'claude')
    const launchLog = path.join(dir, 'launches.jsonl')
    const emptyHome = path.join(dir, 'empty-home')
    mkdirSync(emptyHome)
    // Why: a login shell's PATH lands ahead of the launch PATH, and a PATH miss falls back to
    // install dirs; a real claude in any of those could be probed before the stub, so never launch.
    const shadowing = resolveCliCommand('claude', {
      pathEnv: [...SYSTEM_DIRS, ...macLoginShellPathDirs()].join(path.delimiter),
      homePath: emptyHome
    })
    if (path.isAbsolute(shadowing)) {
      rmSync(dir, { recursive: true, force: true })
      testInfo.skip(true, 'a system-wide claude would shadow the stub')
    }
    const quote = (value: string): string => `'${value.replaceAll("'", `'\\''`)}'`
    // Absolute node and stub paths, so the wrapper needs nothing from PATH to run.
    if (process.platform === 'win32') {
      writeFileSync(command, `@"${process.execPath}" "${STUB_SCRIPT}" "${launchLog}" %*\r\n`)
    } else {
      writeFileSync(
        command,
        `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(STUB_SCRIPT)} ${quote(launchLog)} "$@"\n`
      )
      chmodSync(command, 0o755)
    }
    // Native chat takes one program token: a bare Windows path, not a PowerShell `& '...'` call.
    const override = process.platform === 'win32' ? command : buildFakeAgentCommandOverride(command)
    await provideFixture({ command, launchLog, override })
    rmSync(dir, { recursive: true, force: true })
  },
  launchEnv: async ({ claudeStub }, provideFixture) => {
    // Only the stub's directory and the system tool dirs: no user bin, Homebrew or npm prefix.
    // Windows keeps its PATH behind the stub: git, PowerShell and System32 live on it.
    const systemPath =
      process.platform === 'win32' ? [process.env.Path ?? process.env.PATH ?? ''] : SYSTEM_DIRS
    await provideFixture({
      PATH: [path.dirname(claudeStub.command), ...systemPath].join(path.delimiter)
    })
  }
})

/** Creates a chat the way the CLI or a paired phone does: on the host, not in the window. */
export async function createChatOnHost(page: Page, worktreeId: string): Promise<string> {
  const sessionId = createStructuredAgentSessionId('claude', randomUUID)
  const worktree = `id:${worktreeId}`
  const params = {
    envelope: {
      sessionId,
      clientOperationId: createStructuredAgentSessionOperationId(randomUUID),
      expectedRuntimeFence: null,
      payloadFingerprint: structuredAgentSessionCreateFingerprint({
        sessionId,
        worktree,
        agent: 'claude'
      })
    },
    worktree,
    agent: 'claude'
  }
  const reply = await page.evaluate(
    (p) => window.api.runtime.call({ method: 'agentSession.create', params: p }),
    params
  )
  expect(reply, JSON.stringify(reply)).toMatchObject({ ok: true })
  return sessionId
}
