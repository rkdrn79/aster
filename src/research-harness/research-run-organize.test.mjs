import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { updateExperimentBrief } from './research-experiment-brief.mjs'
import { createExperiment, createRun, initializeResearchProject } from './research-project.mjs'

const cli = path.join(import.meta.dirname, 'cli.mjs')
const noAgent = {
  ORCA_AGENT_SESSION_ID: '',
  ORCA_TERMINAL_HANDLE: '',
  ORCA_PANE_KEY: '',
  ORCA_AGENT_PANE: '',
  CLAUDECODE: '',
  CLAUDE_CODE_ENTRYPOINT: '',
  CLAUDE_CODE_SESSION_ID: '',
  CODEX_THREAD_ID: '',
  CODEX_SANDBOX: '',
  CODEX_SANDBOX_NETWORK_DISABLED: '',
  CODEX_MANAGED_BY_NPM: '',
  CODEX_MANAGED_BY_BUN: '',
  GEMINI_CLI: '',
  AI_AGENT: ''
}
const claudeAgent = { CLAUDECODE: '1', CLAUDE_CODE_SESSION_ID: 'session-7' }

function harness(project, args, { env = {} } = {}) {
  const end = args.includes('--') ? args.indexOf('--') : args.length
  const child = spawn(
    process.execPath,
    [cli, ...args.slice(0, end), '--project', project, '--json', ...args.slice(end)],
    { cwd: project, env: { ...process.env, ...noAgent, ...env }, stdio: ['ignore', 'pipe', 'pipe'] }
  )
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk) => (stdout += chunk))
  child.stderr.on('data', (chunk) => (stderr += chunk))
  return new Promise((resolve) => {
    child.on('close', (code) => resolve({ code, stderr, body: JSON.parse(stdout) }))
  })
}

async function succeeds(project, args, options) {
  const result = await harness(project, args, options)
  assert.equal(result.code, 0, JSON.stringify(result.body))
  return result.body
}

async function fixtureProject(task) {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-organize-')))
  const outside = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-outside-')))
  try {
    await initializeResearchProject(project)
    await createExperiment(project, 'Main')
    await task(project, outside)
  } finally {
    await rm(project, { recursive: true, force: true })
    await rm(outside, { recursive: true, force: true })
  }
}

function runFolder(project, id) {
  return path.join(project, '.aster/experiments/main/runs', id)
}

async function jsonLines(file) {
  return (await readFile(file, 'utf8'))
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
}

function withoutTime({ at, ...rest }) {
  assert.equal(typeof at, 'string')
  return rest
}

test('run exec records ASTER_MEDIA lines, refuses files outside the project, and writes summary.json', async () => {
  await fixtureProject(async (project, outside) => {
    const stranger = path.join(outside, 'stranger.png')
    await writeFile(stranger, 'png')
    await writeFile(
      path.join(project, 'train.mjs'),
      `import { mkdirSync, writeFileSync } from 'node:fs'
mkdirSync('samples', { recursive: true })
writeFileSync('samples/step_5.png', 'image')
console.log('ASTER_MEDIA ' + JSON.stringify({ path: 'samples/step_5.png', step: 5, label: 'samples' }))
console.error('ASTER_MEDIA ' + JSON.stringify({ path: ${JSON.stringify(stranger)} }))
console.log('ASTER_METRIC ' + JSON.stringify({ step: 5, split: 'val', metrics: { acc: 0.5 } }))
`
    )
    const { code, body, stderr } = await harness(project, [
      'run',
      'exec',
      '--experiment',
      'main',
      '--id',
      'media-1',
      '--',
      process.execPath,
      'train.mjs'
    ])
    assert.equal(code, 0, stderr)
    assert.equal(body.mediaItems, 1)
    assert.match(stderr, /ignored ASTER_MEDIA line: Media file is outside the project/u)
    const rows = await jsonLines(path.join(runFolder(project, 'media-1'), 'media.jsonl'))
    assert.deepEqual(rows.map(withoutTime), [
      {
        schemaVersion: 1,
        kind: 'image',
        path: 'samples/step_5.png',
        step: 5,
        label: 'samples',
        sampleId: null,
        bytes: 5,
        source: 'exec'
      }
    ])
    const summary = JSON.parse(
      await readFile(path.join(runFolder(project, 'media-1'), 'summary.json'), 'utf8')
    )
    assert.deepEqual(
      [summary.run, summary.state, summary.exitCode, summary.primary, summary.baseline],
      ['main/media-1', 'succeeded', 0, null, null]
    )
    assert.deepEqual(summary.media, { image: 1, video: 0, audio: 0 })
    assert.deepEqual(summary.notes, [])
  })
})

test('the media index merges attached files, outputs.jsonl media and imagePath, and artifacts/', async () => {
  await fixtureProject(async (project, outside) => {
    const run = await createRun(project, { experiment: 'main', name: 'run r', id: 'r' })
    await writeFile(path.join(project, 'clip.mp4'), 'video')
    const attached = await succeeds(project, [
      'run',
      'attach-artifact',
      '--run',
      'main/r',
      '--file',
      'clip.mp4',
      '--step',
      '3',
      '--label',
      'rollout',
      '--sample',
      's-1'
    ])
    const prefix = '.aster/experiments/main/runs/r'
    assert.deepEqual(withoutTime(attached.media), {
      schemaVersion: 1,
      kind: 'video',
      path: `${prefix}/artifacts/clip.mp4`,
      step: 3,
      label: 'rollout',
      sampleId: 's-1',
      bytes: 5,
      source: 'attach'
    })
    await writeFile(path.join(outside, 'far.png'), 'png')
    const refused = await harness(project, [
      'run',
      'attach-artifact',
      '--run',
      'main/r',
      '--file',
      path.join(outside, 'far.png'),
      '--mode',
      'reference',
      '--label',
      'far'
    ])
    assert.equal(refused.body.error.code, 'outside_project')
    await writeFile(path.join(project, 'notes.txt'), 'text')
    const plain = await succeeds(project, [
      'run',
      'attach-artifact',
      '--run',
      'main/r',
      '--file',
      'notes.txt'
    ])
    assert.equal(plain.media, null)

    await mkdir(path.join(run.paths.run, 'gen'))
    await writeFile(path.join(run.paths.run, 'gen/s-1.webm'), 'webm')
    await mkdir(path.join(project, 'figures'))
    await writeFile(path.join(project, 'figures/s-2.png'), 'png')
    await mkdir(path.join(run.paths.artifacts, 'frames'))
    await writeFile(path.join(run.paths.artifacts, 'frames/f.gif'), 'gif')
    await writeFile(
      path.join(run.paths.run, 'outputs.jsonl'),
      [
        {
          sampleId: 's-1',
          output: 'a',
          media: [{ kind: 'video', path: 'gen/s-1.webm', label: 'gen' }]
        },
        { sampleId: 's-2', output: 'b', imagePath: 'figures/s-2.png' }
      ]
        .map((row) => `${JSON.stringify(row)}\n`)
        .join('')
    )
    const index = await succeeds(project, ['media', '--run', 'main/r'])
    assert.equal(index.truncated, false)
    assert.deepEqual(
      index.items.map((item) => [
        item.kind,
        item.path,
        item.step,
        item.label,
        item.sampleId,
        item.source
      ]),
      [
        ['video', `${prefix}/artifacts/clip.mp4`, 3, 'rollout', 's-1', 'attach'],
        ['video', `${prefix}/gen/s-1.webm`, null, 'gen', 's-1', 'outputs'],
        // Found from the project root, where Aster's sample views have read imagePath.
        ['image', 'figures/s-2.png', null, null, 's-2', 'outputs'],
        ['image', `${prefix}/artifacts/frames/f.gif`, null, null, null, 'scan']
      ]
    )
  })
})

test('summary.json compares the primary metric with the baseline and keeps notes across organize', async () => {
  await fixtureProject(async (project) => {
    const points = { base: [0.7, 0.8], cand: [0.85, 0.83] }
    for (const [id, values] of Object.entries(points)) {
      const run = await createRun(project, { experiment: 'main', name: id, id })
      await writeFile(
        run.paths.metrics,
        values
          .map((acc, index) =>
            JSON.stringify({
              schemaVersion: 1,
              runId: id,
              step: index + 1,
              split: 'val',
              metrics: { acc }
            })
          )
          .join('\n')
      )
    }
    await updateExperimentBrief(
      project,
      'main',
      {
        primaryMetric: { name: 'acc', split: 'val', direction: 'maximize' },
        baseline: 'main/base'
      },
      { by: 'user' }
    )
    for (const id of Object.keys(points)) {
      await succeeds(project, ['run', 'finish', '--run', `main/${id}`, '--status', 'succeeded'])
    }
    const read = async (id) =>
      JSON.parse(await readFile(path.join(runFolder(project, id), 'summary.json'), 'utf8'))
    const candidate = await read('cand')
    assert.equal(candidate.state, 'succeeded')
    assert.deepEqual(candidate.primary, {
      metric: 'acc',
      split: 'val',
      direction: 'maximize',
      last: { value: 0.83, step: 2 },
      best: { value: 0.85, step: 1 }
    })
    assert.deepEqual(candidate.baseline, {
      run: 'main/base',
      last: { value: 0.8, step: 2 },
      best: { value: 0.8, step: 2 },
      delta: { last: 0.03, best: 0.05 }
    })
    const checked = await harness(project, ['check', '--run', 'main/cand'])
    const expected = { fail: 0, warn: 0, info: 0 }
    for (const finding of checked.body.findings) {
      expected[finding.severity] += 1
    }
    assert.deepEqual(candidate.findings, expected)
    assert.equal((await read('base')).baseline, null)

    const noted = await succeeds(
      project,
      ['run', 'annotate', '--run', 'main/cand', '--text', 'val acc +0.03 over base; 1 seed'],
      { env: claudeAgent }
    )
    assert.equal(noted.note.by, 'agent')
    assert.equal(noted.note.agent.provider, 'claude-code')
    const impersonation = await harness(
      project,
      ['run', 'annotate', '--run', 'main/cand', '--text', 'looks fine', '--by', 'user'],
      { env: claudeAgent }
    )
    assert.equal(impersonation.code, 1)
    assert.equal(impersonation.body.error.code, 'forbidden')

    const organized = await succeeds(project, ['organize', '--experiment', 'main'])
    assert.equal(organized.organized, 2)
    const again = await read('cand')
    assert.ok(again.generatedAt > candidate.generatedAt)
    assert.deepEqual(
      again.notes.map((note) => [note.text, note.by]),
      [['val acc +0.03 over base; 1 seed', 'agent']]
    )
  })
})
