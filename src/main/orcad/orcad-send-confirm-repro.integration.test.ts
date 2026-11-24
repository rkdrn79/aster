// Reproduction for "Aster couldn't confirm the message was delivered": a real orcad, a scripted
// Claude held mid-turn on a long tool call after a long stream, and a proxy that makes the link
// behave like an SSH tunnel to a far server. It shows that the host accepts a mid-turn send at
// once (as a card, or a row held for the next step) whatever the journal's size, and that a reply
// lost with the link leaves the message recorded on the host — what the client must check before
// it warns. Opt-in: ORCA_SEND_CONFIRM_REPRO=1 with an orcad template (ORCA_ORCAD_TEMPLATE_PATH) and
// a Node runtime (ORCA_PINNED_NODE). ORCA_SEND_CONFIRM_LATENCY_MS, _BYTES_PER_SEC and _FRAMES
// shape the link and the journal.
import { randomUUID } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync
} from 'node:fs'
import { delimiter, dirname, join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { getDefaultPersistedState } from '../../shared/constants'
import { folderWorkspaceKey } from '../../shared/workspace-scope'
import { spawnProcess } from '@orca/process-host'
import { computeAgentSessionPayloadFingerprint } from '../../shared/agent-session-mutation-envelope'
import { parsePairingCode } from '../../shared/pairing'
import {
  pairedRuntimeConnectionFromOffer,
  type PairedRuntimeConnection
} from '../../shared/paired-runtime-connection'
import { sendRemoteRuntimeRequest } from '../../shared/remote-runtime-client'
import { ELECTRON_REMOTE_RUNTIME_CLIENT_CAPABILITIES } from '../../shared/electron-remote-runtime-client-capabilities'
import { claudeSessionIdForOrcaSession } from '../claude/claude-structured-session-id'
import { quotePosixShell } from '../../shared/shell-argument-quoting'
import { materializeOrcadArtifact } from './orcad-artifact-materializer'
import {
  hostServerTarget,
  installPackagedOrcadSlotForTests,
  locatePinnedNodeForTests,
  skipForMissingInputs
} from './orcad-node-slot-fixture'
import {
  killChildAndWait,
  killProfileDaemons,
  removeTestRoot
} from './orcad-daemon-teardown-fixture'
import { startLatencyProxy, type LatencyProxy } from './orcad-latency-proxy.test-fixture'

const pinnedNode = locatePinnedNodeForTests()
const templateDir = process.env.ORCA_ORCAD_TEMPLATE_PATH ?? resolve('out/orcad-template')
const missing = [
  ...(!pinnedNode ? ['a pinned Node runtime'] : []),
  ...(!existsSync(templateDir) ? [templateDir] : [])
]
const skip =
  !process.env.ORCA_SEND_CONFIRM_REPRO ||
  skipForMissingInputs('artifact', missing) ||
  process.platform === 'win32'
const ONE_WAY_MS = Number(process.env.ORCA_SEND_CONFIRM_LATENCY_MS ?? 150)
const BYTES_PER_SEC = Number(process.env.ORCA_SEND_CONFIRM_BYTES_PER_SEC ?? 500_000)
const FRAMES = Number(process.env.ORCA_SEND_CONFIRM_FRAMES ?? 400)

const Ready = z.object({ pairing: z.object({ available: z.literal(true), url: z.string() }) })
const Group = z.object({ group: z.object({ id: z.string() }) })
const Folder = z.object({ folderWorkspace: z.object({ id: z.string() }) })
const Created = z.object({ value: z.object({ fence: z.number() }) })
const SendAnswer = z.object({
  ok: z.literal(true),
  value: z.union([
    z.object({ queued: z.object({ messageId: z.string() }) }),
    z.object({ submission: z.object({ dispatchState: z.string() }) })
  ])
})
const Tail = z.object({
  page: z.object({
    submissions: z.array(z.object({ clientMessageId: z.string(), dispatchState: z.string() })),
    queuedMessages: z.array(z.object({ messageId: z.string() })).nullish()
  })
})

const roots: string[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) {
    await killProfileDaemons(join(root, 'data'))
    await removeTestRoot(root)
  }
})

function launch(slotDir: string, runtime: string, userData: string, home: string) {
  const child = spawnProcess({
    program: runtime,
    args: [join(slotDir, 'orcad.js'), '--bind', '127.0.0.1', '--port', '0', '--json'],
    cwd: home,
    env: {
      HOME: home,
      CLAUDE_CONFIG_DIR: join(home, '.claude'),
      PATH: [dirname(userData), dirname(runtime), '/usr/bin', '/bin'].join(delimiter),
      SHELL: '/bin/sh',
      LANG: 'en_US.UTF-8',
      ORCA_BACKGROUND_LAUNCH: '1',
      ORCA_DISABLE_MACOS_LOGIN_SHELL: '1',
      ORCA_USER_DATA: userData
    },
    timeoutMs: null
  })
  let output = ''
  let stderr = ''
  child.stderr.on('data', (data: Buffer) => (stderr += data.toString()))
  const ready = new Promise<PairedRuntimeConnection>((resolveReady, reject) => {
    const timer = setTimeout(() => reject(new Error(`No server readiness: ${stderr}`)), 30_000)
    child.once('exit', (code) => reject(new Error(`Server exited ${code}: ${stderr}`)))
    child.stdout.on('data', (data: Buffer) => {
      output += data.toString()
      if (!output.includes('\n')) {
        return
      }
      clearTimeout(timer)
      const offer = parsePairingCode(Ready.parse(JSON.parse(output.split('\n')[0]!)).pairing.url)
      if (offer) {
        resolveReady(pairedRuntimeConnectionFromOffer(offer))
      } else {
        reject(new Error('Invalid server pairing offer'))
      }
    })
  })
  return { child, ready }
}

function envelope(sessionId: string, method: string, fields: object, fence: number | null) {
  return {
    sessionId,
    clientOperationId: `${Date.now()}-${randomUUID().replaceAll('-', '')}`,
    expectedRuntimeFence: fence,
    payloadFingerprint: computeAgentSessionPayloadFingerprint({
      method,
      sessionId,
      fields: { ...fields }
    })
  }
}

/** A long turn: `frames` big assistant messages, then a tool call held until `ackPath` exists. */
function longTurnScenario(providerSessionId: string, ackPath: string, frames: number) {
  const frame = (fields: Record<string, unknown>) => ({
    uuid: randomUUID(),
    session_id: providerSessionId,
    parent_tool_use_id: null,
    ...fields
  })
  const say = (id: string, content: unknown[]) =>
    frame({ type: 'assistant', message: { id, role: 'assistant', content } })
  const filler = 'x'.repeat(4_000)
  const stream = Array.from({ length: frames }, (_, index) => ({
    emit: say(`m-${index}`, [{ type: 'text', text: `${index} ${filler}` }])
  }))
  const tool = { type: 'tool_use', id: 'toolu_train', name: 'Bash', input: { command: 'train' } }
  const result = { type: 'tool_result', tool_use_id: 'toolu_train', content: 'done' }
  return {
    controlResponses: {
      initialize: { commands: [], models: [{ value: 'sonnet', displayName: 'Sonnet' }] }
    },
    steps: [
      { awaitUserMessage: true },
      ...stream,
      { emit: say('tool', [tool]) },
      { awaitFile: { path: ackPath, timeoutMs: 120_000 } },
      { emit: frame({ type: 'user', message: { role: 'user', content: [result] } }) },
      { emit: frame({ type: 'result', subtype: 'success', is_error: false, result: 'done' }) },
      { delayMs: 2_000 }
    ]
  }
}

async function startServer(root: string, sessionId: string, ackPath: string) {
  const home = join(root, 'home')
  const userData = join(root, 'data')
  mkdirSync(home)
  mkdirSync(userData)
  const slot = await materializeOrcadArtifact(hostServerTarget(), {
    templateDir,
    cacheRoot: join(root, 'artifacts')
  })
  const { slotDir, runtime } = installPackagedOrcadSlotForTests(root, pinnedNode ?? '', slot)
  const script = join(root, 'claude-scripted.mjs')
  const fakeCli = join(root, 'claude')
  const fixture = resolve('src/main/claude/__fixtures__/claude-agent-sdk-scripted-cli.mjs')
  writeFileSync(script, readFileSync(fixture, 'utf8'))
  const exec = `exec ${quotePosixShell(runtime)} ${quotePosixShell(script)} "$@"`
  writeFileSync(fakeCli, `#!/bin/sh\n${exec}\n`)
  chmodSync(fakeCli, 0o700)
  const scenarioPath = join(root, 'scenario.json')
  const scenario = longTurnScenario(claudeSessionIdForOrcaSession(sessionId), ackPath, FRAMES)
  writeFileSync(scenarioPath, JSON.stringify(scenario))
  const state = getDefaultPersistedState(home)
  state.settings = {
    ...state.settings,
    agentStatusHooksEnabled: false,
    nativeChatInheritShellEnvironment: false,
    agentCmdOverrides: { claude: fakeCli },
    agentDefaultEnv: {
      claude: {
        CLAUDE_CONFIG_DIR: join(home, 'claude-config'),
        ORCA_SDK_CONTRACT_SCENARIO_PATH: scenarioPath,
        ORCA_SDK_CONTRACT_REPORT_PATH: join(root, 'report.json'),
        ORCA_SDK_CONTRACT_TIMEOUT_MS: '180000'
      }
    }
  }
  writeFileSync(join(userData, 'orca-data.json'), JSON.stringify(state))
  return { home, server: launch(slotDir, runtime, userData, home) }
}

describe.skipIf(skip)('send confirmation over a slow link, against a real orcad', () => {
  it('accepts mid-turn sends at once, and records a send whose reply the link lost', async () => {
    const root = realpathSync(mkdtempSync(join('/tmp', 'orca-send-confirm-')))
    roots.push(root)
    const sessionId = randomUUID()
    const ackPath = join(root, 'tool-finished')
    const { home, server } = await startServer(root, sessionId, ackPath)
    let proxy: LatencyProxy | undefined
    const log: string[] = []
    try {
      const direct = await server.ready
      const port = Number(new URL(direct.endpoint).port)
      proxy = await startLatencyProxy(port, ONE_WAY_MS, BYTES_PER_SEC)
      const pairing = { ...direct, endpoint: direct.endpoint.replace(`:${port}`, `:${proxy.port}`) }
      const call = async (method: string, params: unknown) => {
        const started = Date.now()
        try {
          const response = await sendRemoteRuntimeRequest<unknown>(
            pairing,
            method,
            params,
            20_000,
            undefined,
            undefined,
            ELECTRON_REMOTE_RUNTIME_CLIENT_CAPABILITIES
          )
          const ms = Date.now() - started
          log.push(`${method}: ${ms} ms, ${JSON.stringify(response).length} bytes`)
          return { result: response.ok ? response.result : undefined, ms }
        } catch (error) {
          const ms = Date.now() - started
          log.push(`${method}: threw after ${ms} ms: ${String(error)}`)
          return { error, ms }
        }
      }
      const group = Group.parse((await call('projectGroup.create', { name: 'G' })).result)
      const folder = Folder.parse(
        (
          await call('folderWorkspace.create', {
            projectGroupId: group.group.id,
            folderPath: home,
            name: 'F'
          })
        ).result
      )
      const fields = { worktree: folderWorkspaceKey(folder.folderWorkspace.id), agent: 'claude' }
      const { fence } = Created.parse(
        (
          await call('agentSession.create', {
            ...fields,
            envelope: envelope(sessionId, 'agentSession.create', fields, null)
          })
        ).result
      ).value
      const send = (text: string, delivery?: 'queue-if-active') => {
        const body = { kind: 'message', role: 'user', blocks: [{ type: 'text', text }] }
        const sent = { body, ...(delivery ? { delivery } : {}) }
        return call('agentSession.send', {
          ...sent,
          envelope: envelope(sessionId, 'agentSession.send', sent, fence)
        })
      }
      await send('start the long run')
      // The turn streams its frames and reaches the held tool call.
      await new Promise((settle) => setTimeout(settle, 8_000))
      const queued = await send('mid-turn, queued', 'queue-if-active')
      const steered = await send('mid-turn, direct')
      // A send behind a big page on the same link.
      const [, behind] = await Promise.all([
        call('agentSession.history', { sessionId, direction: 'tail', limit: 200 }),
        new Promise((settle) => setTimeout(settle, 50)).then(() =>
          send('mid-turn, behind a big page', 'queue-if-active')
        )
      ])
      // The request reaches the host; its reply is lost with the link. The last client chunk of a
      // finished request is its close frame, so the one before it is the request.
      proxy.cutNextReplyAfter(proxy.lastClientChunks() - 1)
      const lost = await send('mid-turn, reply lost', 'queue-if-active')
      await new Promise((settle) => setTimeout(settle, 1_000))
      const tail = Tail.parse(
        (await call('agentSession.history', { sessionId, direction: 'tail', limit: 60 })).result
      ).page
      writeFileSync(ackPath, '')
      console.log(
        [`latency ${ONE_WAY_MS} ms one-way, ${BYTES_PER_SEC} B/s, ${FRAMES} frames`, ...log].join(
          '\n  '
        )
      )
      // Mid-turn, the host answers as fast as any call: a card, or a row held for the next step.
      expect(SendAnswer.parse(queued.result).value).toHaveProperty('queued')
      expect(SendAnswer.parse(steered.result).value).toMatchObject({
        submission: { dispatchState: 'pending' }
      })
      expect(queued.ms).toBeLessThan(10 * ONE_WAY_MS + 2_000)
      expect(behind.ms).toBeGreaterThan(queued.ms)
      // The client saw only a dropped link; the host holds the message all the same.
      expect('error' in lost).toBe(true)
      expect(tail.queuedMessages ?? []).toHaveLength(3)
    } finally {
      proxy?.close()
      await killChildAndWait(server.child)
    }
  }, 240_000)
})
