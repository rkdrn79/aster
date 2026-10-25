import { execFileSync } from 'node:child_process'
import {
  appendFile,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ResearchProjectRoot } from './research-project-files'
import { readResearchProject } from './research-project-overview'
import { readResearchProjectRun, readResearchProjectRunLogTail } from './research-project-run-read'

const CLI = join(import.meta.dirname, '..', '..', 'research-harness', 'cli.mjs')
const STEPS = 50
// Eight series, so the overview's six-series cap has to choose; only `loss` is defined.
const TRAIN_SCRIPT = `
const fs = require('fs'), path = require('path')
for (let step = 0; step < ${STEPS}; step++) {
  const metrics = { loss: 1 / (step + 1) }
  for (let n = 1; n <= 7; n++) metrics['a' + n] = step * n
  console.log('ASTER_METRIC ' + JSON.stringify({ step, split: 'train', metrics }))
}
const image = path.join(process.env.ASTER_RUN_ARTIFACTS, 'sample.png')
fs.writeFileSync(image, 'not really a png')
console.log('ASTER_MEDIA ' + JSON.stringify({ path: image, step: ${STEPS - 1}, label: 'sample' }))
`

let parent: string
let project: string
let root: ResearchProjectRoot

function harness(args: string[], command: string[] = []): void {
  const exec = command.length > 0 ? ['--', ...command] : []
  execFileSync(process.execPath, [CLI, ...args, '--project', project, ...exec], {
    cwd: project,
    stdio: 'pipe'
  })
}

beforeAll(async () => {
  parent = await realpath(await mkdtemp(join(tmpdir(), 'aster-research-project-')))
  project = join(parent, 'project')
  await mkdir(project)
  harness(['init'])
  harness(['experiment', '--name', 'LoRA r16'])
  harness(['brief', 'set', '--experiment', 'lora-r16', '--question', 'Does r16 help?'])
  harness(['new-run', '--experiment', 'lora-r16', '--id', 'seed-1', '--name', 'seed 1'])
  const seed2 = ['--id', 'seed-2', '--name', 'seed 2', '--metric-def', 'loss:minimize']
  harness(
    ['run', 'exec', '--experiment', 'lora-r16', ...seed2],
    [process.execPath, '-e', TRAIN_SCRIPT]
  )
  harness([
    'loop',
    'note',
    '--experiment',
    'lora-r16',
    '--kind',
    'objective',
    '--text',
    'Lower loss',
    '--data',
    '{"metric":"loss","direction":"minimize","maxRuns":2}'
  ])
  harness([
    'loop',
    'note',
    '--experiment',
    'lora-r16',
    '--kind',
    'hypothesis',
    '--text',
    'r16 beats r8'
  ])
  harness([
    'loop',
    'note',
    '--experiment',
    'lora-r16',
    '--kind',
    'run',
    '--text',
    'seed-2',
    '--run',
    'lora-r16/seed-2'
  ])
  harness([
    'loop',
    'note',
    '--experiment',
    'lora-r16',
    '--kind',
    'checkpoint',
    '--text',
    'Approve a longer sweep?'
  ])
  const runs = join(project, '.aster', 'experiments', 'lora-r16', 'runs')
  // A corrupt row, then a row still being written when the reader looks.
  await appendFile(join(runs, 'seed-2', 'metrics.jsonl'), '{not json\n{"schemaVersion":1,"st')
  // A Run folder that is really a link to a folder outside the workspace.
  const outside = join(parent, 'outside')
  await mkdir(outside)
  await writeFile(join(outside, 'run.json'), '{"schemaVersion":1}')
  await writeFile(join(outside, 'train.log'), 'secret\n')
  await symlink(outside, join(runs, 'escape'), 'junction')

  // Canonicalizes and allows everything, so only the per-workspace check can refuse `escape`.
  root = { path: project, authorize: (path) => realpath(path).catch(() => path) }
}, 60_000)

afterAll(async () => {
  await rm(parent, { recursive: true, force: true })
})

describe('researchProject reads of a harness project', () => {
  it('summarizes each Experiment with its brief, latest Run and defined metrics first', async () => {
    const result = await readResearchProject(root)

    expect(result.catalog.status).toBe('present')
    expect(result.truncated).toBe(false)
    const [experiment] = result.experiments
    expect(experiment).toMatchObject({
      slug: 'lora-r16',
      name: 'LoRA r16',
      runCount: 2,
      brief: { question: 'Does r16 help?' },
      latestRun: { id: 'seed-2', state: 'succeeded', exitCode: 0, manifest: 'present' }
    })
    expect(experiment?.latestRun?.startedAt).toEqual(expect.any(String))
    expect(experiment?.latestRun?.finishedAt).toEqual(expect.any(String))
    const metrics = experiment?.latestRun?.metrics
    expect(metrics?.status === 'present' && metrics.value).toMatchObject({
      omittedSeries: 2,
      partial: false
    })
    expect(
      metrics?.status === 'present' && metrics.value.series.map((entry) => entry.name)
    ).toEqual(['loss', 'a1', 'a2', 'a3', 'a4', 'a5'])
    expect(metrics?.status === 'present' && metrics.value.series[0]).toMatchObject({
      split: 'train',
      last: 1 / STEPS,
      lastStep: STEPS - 1,
      direction: 'minimize'
    })
    expect(experiment?.loop.status === 'present' && experiment.loop.value).toMatchObject({
      objective: { text: 'Lower loss', metric: 'loss', direction: 'minimize' },
      budget: { maxRuns: 2, runsUsed: 1, exhausted: false },
      openHypotheses: 1,
      entries: 4,
      last: { kind: 'checkpoint' },
      checkpoint: { text: 'Approve a longer sweep?' },
      partial: false
    })
    // A registered Run that never reported has no execution, and its empty metrics are not an error.
    expect(experiment?.runs[0]).toMatchObject({
      id: 'seed-1',
      state: 'unknown',
      metrics: { status: 'present', value: { series: [] } }
    })
  })

  it('reads one Run: downsampled series, summary, media, and absent files as absent', async () => {
    const result = await readResearchProjectRun(root, {
      experiment: 'lora-r16',
      run: 'seed-2',
      maxPoints: 10
    })

    expect(result.manifest.status === 'present' && result.manifest.value.execution?.state).toBe(
      'succeeded'
    )
    expect(result.summary.status === 'present' && result.summary.value.state).toBe('succeeded')
    expect(result.metrics.status).toBe('present')
    const metrics = result.metrics.status === 'present' ? result.metrics.value : null
    expect(metrics).toMatchObject({ rows: STEPS, malformedLines: 1, omittedSeries: 0 })
    const loss = metrics?.series.find((entry) => entry.name === 'loss')
    expect(loss?.count).toBe(STEPS)
    expect(loss?.points).toHaveLength(10)
    expect(loss?.points[0]).toEqual({ step: 0, value: 1 })
    expect(loss?.points.at(-1)).toEqual({ step: STEPS - 1, value: 1 / STEPS })
    expect(result.artifacts.directory).toMatchObject({
      status: 'present',
      value: { entries: [{ name: 'sample.png', kind: 'file' }], truncated: false }
    })
    expect(result.media).toMatchObject({
      status: 'present',
      value: {
        items: [
          {
            kind: 'image',
            path: '.aster/experiments/lora-r16/runs/seed-2/artifacts/sample.png',
            step: STEPS - 1
          }
        ]
      }
    })
    expect(result.outputs).toEqual({ status: 'absent' })
  })

  it('tails the Run log from a line boundary and reports the whole size', async () => {
    const log = await readFile(
      join(project, '.aster', 'experiments', 'lora-r16', 'runs', 'seed-2', 'train.log'),
      'utf8'
    )

    const tail = await readResearchProjectRunLogTail(root, {
      experiment: 'lora-r16',
      run: 'seed-2',
      maxBytes: 300
    })

    expect(tail).toMatchObject({ status: 'present', truncated: true, size: Buffer.byteLength(log) })
    expect(tail.text.length).toBeGreaterThan(0)
    expect(log.endsWith(tail.text)).toBe(true)
    expect(log.at(-tail.text.length - 1)).toBe('\n')
  })

  it('refuses unsafe names and Run folders that lead out of the workspace', async () => {
    await expect(readResearchProjectRun(root, { experiment: '..', run: 'seed-2' })).rejects.toThrow(
      /slug/
    )
    await expect(
      readResearchProjectRunLogTail(root, { experiment: 'lora-r16', run: '../seed-2' })
    ).rejects.toThrow(/Run ID/)

    const escaped = await readResearchProjectRun(root, { experiment: 'lora-r16', run: 'escape' })
    expect(escaped.manifest).toMatchObject({ status: 'unreadable' })
    await expect(
      readResearchProjectRunLogTail(root, { experiment: 'lora-r16', run: 'escape' })
    ).rejects.toThrow(/outside the workspace/)
  })
})
