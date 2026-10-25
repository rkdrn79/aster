import { describe, expect, it } from 'vitest'
import { parseResearchRunManifest } from './research-run-manifest'
import type { ResearchRunJob } from './research-run-manifest'
import {
  applyResearchJobToManifest,
  parseResearchRunName,
  researchRunPosixPaths
} from './research-run-reference'

const job = (state: ResearchRunJob['state'], exitCode: number | null = null): ResearchRunJob => ({
  scheduler: 'slurm',
  jobId: '4242',
  host: 'gpu-cluster',
  submittedAt: '2026-10-24T01:00:00.000Z',
  state,
  observedAt: '2026-10-24T02:00:00.000Z',
  reason: null,
  exitCode
})

const harnessManifest = (state: string) => ({
  schemaVersion: 1,
  externalRunId: 'seed-42',
  execution: {
    state,
    reportedBy: 'manifest',
    observedAt: '2026-10-24T01:30:00.000Z',
    exitCode: state === 'running' ? null : 0,
    source: 'aster-harness'
  },
  launch: {
    startedAt: '2026-10-24T01:00:00.000Z',
    argv: ['python', 'train.py'],
    by: 'aster-harness'
  },
  futureField: { kept: true }
})

describe('run.json job updates', () => {
  it('writes job and execution while keeping every other field', () => {
    const { manifest, executionWritten } = applyResearchJobToManifest(
      { schemaVersion: 1, externalRunId: 'seed-42', futureField: { kept: true } },
      job('pending'),
      'unknown'
    )
    expect(executionWritten).toBe(true)
    expect(manifest).toMatchObject({
      futureField: { kept: true },
      job: { jobId: '4242', state: 'pending' },
      execution: { state: 'unknown', reportedBy: 'manifest', source: 'aster-slurm' }
    })
    expect(parseResearchRunManifest(JSON.stringify(manifest)).job?.state).toBe('pending')
  })

  it('lets a launcher that saw the exit outrank the scheduler', () => {
    const { manifest, executionWritten } = applyResearchJobToManifest(
      harnessManifest('succeeded'),
      job('failed', 1),
      'failed'
    )
    expect(executionWritten).toBe(false)
    expect(manifest.execution).toMatchObject({ state: 'succeeded', source: 'aster-harness' })
    expect(manifest.job).toMatchObject({ state: 'failed', exitCode: 1 })
  })

  it('ends a Run the launcher left running when the job died', () => {
    const { manifest } = applyResearchJobToManifest(
      harnessManifest('running'),
      job('out_of_memory', 0),
      'failed'
    )
    expect(manifest.execution).toMatchObject({
      state: 'failed',
      source: 'aster-slurm',
      exitCode: 0
    })
    expect(manifest.launch).toMatchObject({ argv: ['python', 'train.py'] })
  })

  it('never downgrades a known state to unknown', () => {
    expect(
      applyResearchJobToManifest(harnessManifest('running'), job('pending'), 'unknown')
        .executionWritten
    ).toBe(false)
  })
})

describe('Run names and paths', () => {
  it('accepts harness slugs and IDs, and refuses paths', () => {
    expect(parseResearchRunName('lora-r16/seed-42')).toEqual({
      experiment: 'lora-r16',
      runId: 'seed-42'
    })
    expect(() => parseResearchRunName('../etc/passwd')).toThrow(/experiment-slug/)
    expect(() => parseResearchRunName('lora/Seed_42')).toThrow()
    expect(
      researchRunPosixPaths({
        targetId: 't',
        projectPath: '/data/me/proj/',
        experiment: 'lora-r16',
        runId: 'seed-42'
      }).log
    ).toBe('/data/me/proj/.aster/experiments/lora-r16/runs/seed-42/train.log')
    expect(
      researchRunPosixPaths({
        targetId: 'ssh-gpu',
        projectPath: '/data/me/proj/',
        experiment: 'lora-r16',
        runId: 'seed-42',
        recordRoot: 'research'
      }).log
    ).toBe('/data/me/proj/research/experiments/lora-r16/runs/seed-42/train.log')
  })
})
