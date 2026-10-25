import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { researchRunWatchDocumentSchema } from '../../shared/research/research-run-watch'
import type { ResearchWatchRuntime } from './research-run-watch-delivery'
import { createResearchRunWatch } from './research-run-agent-api'
import { readResearchRunStatus } from './research-run-status'
import { runResearchRunWatchPass, startResearchRunWatchService } from './research-run-watch-service'

const fixture = vi.hoisted(() => ({ directory: '' }))
vi.mock('../persistence/loading-store/user-data-path', () => ({
  getCanonicalUserDataPath: () => fixture.directory
}))

const prompts: { handle: string; text: string }[] = []
const notifications: string[] = []
let agentStatus: 'idle' | 'working' = 'idle'

const runtime: ResearchWatchRuntime = {
  getTerminalAgentStatus: async () => ({ isRunningAgent: true, status: agentStatus }),
  waitForTerminal: async () => ({ satisfied: agentStatus === 'idle' }),
  sendTerminalAgentPrompt: async (handle, text, options) => {
    await options.beforeWrite?.('pty-1')
    prompts.push({ handle, text })
    return { accepted: true }
  },
  resolveTerminalPane: () => ({ handle: 'term_reminted' }),
  dispatchPluginNotification: async ({ title }) => {
    notifications.push(title)
    return { delivered: true }
  }
}

let project = ''
let runDir = ''

function manifest(state: string): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    externalRunId: 'seed-42',
    execution: {
      state,
      reportedBy: 'manifest',
      observedAt: new Date().toISOString(),
      exitCode: state === 'failed' ? 1 : null,
      source: 'aster-harness'
    },
    metrics: { definitions: { loss: { direction: 'minimize' } } }
  })}\n`
}

beforeEach(async () => {
  fixture.directory = await mkdtemp(join(tmpdir(), 'aster-watch-data-'))
  project = await mkdtemp(join(tmpdir(), 'aster-watch-project-'))
  runDir = join(project, 'research', 'experiments', 'lora-r16', 'runs', 'seed-42')
  await mkdir(runDir, { recursive: true })
  await writeFile(join(project, 'research', 'project.json'), '{"schemaVersion":1}')
  await writeFile(join(runDir, 'run.json'), manifest('running'))
  await writeFile(
    join(runDir, 'metrics.jsonl'),
    '{"schemaVersion":1,"runId":"seed-42","step":1,"split":"train","metrics":{"loss":2.5}}\n'
  )
  await writeFile(join(runDir, 'train.log'), 'old Traceback before the watch\n')
  prompts.length = 0
  notifications.length = 0
  agentStatus = 'idle'
  startResearchRunWatchService(() => runtime)
})

afterEach(async () => {
  await rm(fixture.directory, { recursive: true, force: true })
  await rm(project, { recursive: true, force: true })
})

async function storedWatches() {
  const content = await readFile(join(fixture.directory, 'research', 'run-watches.json'), 'utf8')
  return researchRunWatchDocumentSchema.parse(JSON.parse(content)).watches
}

describe('research Run watches', () => {
  it('fires each condition once, waits for an idle owner, and survives a reload', async () => {
    const created = await createResearchRunWatch({
      run: 'lora-r16/seed-42',
      cwd: join(runDir, 'artifacts'),
      on: ['failed', 'log:Traceback'],
      message: 'compare with baseline',
      owner: { terminalHandle: 'term_1', paneKey: 'tab:leaf' }
    })
    expect(created.watch.owner).toBe('terminal term_1')
    await runResearchRunWatchPass()
    // A Traceback already in the log before the watch is not news.
    expect(prompts).toEqual([])

    agentStatus = 'working'
    await appendFile(join(runDir, 'train.log'), 'Traceback (most recent call last):\n')
    await writeFile(join(runDir, 'run.json'), manifest('failed'))
    await runResearchRunWatchPass()
    expect(prompts).toEqual([])
    expect(notifications).toEqual([
      'Run lora-r16/seed-42: failed',
      'Run lora-r16/seed-42: log:Traceback'
    ])
    const pending = (await storedWatches())[0]
    expect(pending.state).toBe('done')
    expect(pending.fired.map((event) => event.delivery.state)).toEqual(['pending', 'pending'])
    expect(pending.fired[0].delivery.detail).toContain('mid-turn')

    agentStatus = 'idle'
    await runResearchRunWatchPass()
    await runResearchRunWatchPass()
    expect(prompts).toHaveLength(1)
    expect(prompts[0].handle).toBe('term_1')
    expect(prompts[0].text).toContain(
      `[Aster research watch ${created.watch.id}] Run lora-r16/seed-42:`
    )
    expect(prompts[0].text).toContain(
      '- failed fired: Run execution failed (exit 1) per aster-harness'
    )
    expect(prompts[0].text).toContain('- log:Traceback fired: log line: Traceback')
    expect(prompts[0].text).toContain('Your note: compare with baseline')
    expect(prompts[0].text).toContain(`research status --run lora-r16/seed-42 --project ${project}`)
    expect(notifications).toHaveLength(2)

    const stored = await storedWatches()
    expect(stored[0].fired.map((event) => event.delivery.state)).toEqual(['delivered', 'delivered'])
  })

  it('reads a cheap status with last and best metrics', async () => {
    await appendFile(
      join(runDir, 'metrics.jsonl'),
      '{"schemaVersion":1,"runId":"seed-42","step":2,"split":"train","metrics":{"loss":1.5}}\n{"step":3,"split":"train","metrics":{"loss":1.9}}\n'
    )
    const status = await readResearchRunStatus({ run: 'lora-r16/seed-42', project })
    expect(status.execution).toMatchObject({ state: 'running', source: 'aster-harness' })
    expect(status.metrics.last).toMatchObject({ step: 3, metrics: { loss: 1.9 } })
    expect(status.metrics.series).toEqual([
      expect.objectContaining({ name: 'loss', last: 1.9, best: 1.5, direction: 'minimize' })
    ])
    expect(status.log.lines).toEqual(['old Traceback before the watch'])
  })
})
