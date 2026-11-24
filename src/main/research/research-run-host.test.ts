import { execFileSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { hostname, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { researchRunLogNote } from '../../shared/research/research-run-host'
import { runHostBits, runManifestParts } from './research-run-host-paths'
import { harnessSlurmRunLink } from './research-slurm-run-adopt'

const adopted = vi.hoisted(() => {
  const calls: unknown[] = []
  return { calls }
})

vi.mock('./research-slurm-run-adopt', async (importOriginal) => {
  const actual: object = await importOriginal()
  return {
    ...actual,
    adoptHarnessSlurmJobs: vi.fn(async (...args: unknown[]) => {
      adopted.calls.push(args)
      return new Map()
    })
  }
})
vi.mock('./research-compute-transport', () => ({ runResearchComputeCommand: vi.fn() }))

const { buildRunHostReadCommand, observeResearchRunHosts, parseRunHostRead } =
  await import('./research-run-host')

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

/** A project shaped like the copied 3D-LeWAM records: Runs from node05 and from this host. */
function lewamProject(): {
  project: string
  run: (id: string) => { manifest: string; log: string }
} {
  const project = mkdtempSync(join(tmpdir(), 'aster-run-host-'))
  roots.push(project)
  const write = (
    id: string,
    launch: Record<string, unknown>,
    extra: Record<string, unknown> = {}
  ) => {
    const dir = join(project, '.aster', 'experiments', 'drawer-tc-main', 'runs', id)
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, 'run.json'),
      JSON.stringify({
        schemaVersion: 1,
        name: id,
        execution: {
          state: 'running',
          reportedBy: 'manifest',
          observedAt: '2026-11-19T20:35:32.232Z'
        },
        launch: { by: 'aster-harness', startedAt: '2026-11-19T20:02:30.291Z', ...launch },
        ...extra
      })
    )
  }
  write('a-tokens-seed-42', { host: 'node05', cwd: '/data/projects/mingu/JEPA_Research/3D-LeWAM' })
  write('here', { host: hostname(), cwd: project })
  write(
    'in-job',
    { host: 'node07', cwd: project },
    {
      job: { scheduler: 'slurm', jobId: '4242', recordedBy: 'aster-harness', state: 'running' }
    }
  )
  const run = (id: string) => {
    const dir = join(project, '.aster', 'experiments', 'drawer-tc-main', 'runs', id)
    return { manifest: join(dir, 'run.json'), log: join(dir, 'train.log') }
  }
  return { project, run }
}

describe('Run host observation', () => {
  it('reads host, run.json and why each log is absent in one shell command', () => {
    const { run } = lewamProject()
    const runs = ['a-tokens-seed-42', 'here', 'in-job'].map((id) => ({
      manifestPath: run(id).manifest,
      logPath: run(id).log
    }))
    writeFileSync(run('here').log, '')
    writeFileSync(run('in-job').log, 'epoch 1\n')
    if (process.getuid?.() !== 0) {
      chmodSync(run('in-job').log, 0o000)
    }
    const stdout = execFileSync('/bin/sh', ['-c', buildRunHostReadCommand(runs, 'n1')], {
      encoding: 'utf8'
    })
    const { thisHost, reads } = parseRunHostRead(stdout, runs, 'n1')
    expect(thisHost).toBeTruthy()
    expect(reads.map((read) => read.log.state)).toEqual([
      'missing',
      'empty',
      process.getuid?.() === 0 ? 'present' : 'unreadable'
    ])
    expect(runHostBits(reads[0].manifest)).toMatchObject({ launchHost: 'node05', running: true })
    expect(JSON.parse(reads[1].manifest ?? '{}')).toEqual(
      JSON.parse(readFileSync(run('here').manifest, 'utf8'))
    )
  })

  it('marks Runs recorded on another host whose folder is missing here, and only those', async () => {
    const { run } = lewamProject()
    const observation = await observeResearchRunHosts({
      targetId: null,
      runs: ['a-tokens-seed-42', 'here', 'in-job'].map((id) => ({
        manifestPath: run(id).manifest,
        logPath: run(id).log
      }))
    })
    expect(observation.thisHost).toBe(hostname())
    const facts = (id: string) => observation.runs[run(id).manifest]
    expect(facts('a-tokens-seed-42')).toMatchObject({
      launchHost: 'node05',
      recordedOn: 'node05',
      log: { state: 'missing' }
    })
    expect(facts('here').recordedOn).toBeNull()
    // A compute node with the project on a shared filesystem stays observable.
    expect(facts('in-job')).toMatchObject({
      recordedOn: null,
      job: { jobId: '4242', tracked: false }
    })
    expect(adopted.calls).toEqual([])
  })

  it('says why there is no log in plain words', () => {
    expect(researchRunLogNote({ state: 'missing', reason: null }, 'node05', false)).toMatch(
      /^Log not on this host: it stays on node05/u
    )
    expect(researchRunLogNote({ state: 'missing', reason: null }, null, true)).toBe(
      'No log yet: the Run has not written to it.'
    )
    expect(researchRunLogNote({ state: 'empty', reason: null }, null, false)).toBe(
      'The log is empty.'
    )
    expect(researchRunLogNote({ state: 'present', reason: null }, null, true)).toBeNull()
  })

  it('links a job run exec recorded to its Run, tracked from now and never back-dated', () => {
    const path = '/data/me/3D-LeWAM/.aster/experiments/drawer-tc-main/runs/c-seed-42/run.json'
    expect(runManifestParts(path)).toEqual({
      projectPath: '/data/me/3D-LeWAM',
      recordRoot: '.aster',
      experiment: 'drawer-tc-main',
      runId: 'c-seed-42'
    })
    expect(
      harnessSlurmRunLink('ssh-elice', 'Elice-GPU', { manifestPath: path, jobId: '4242' }, 'T')
    ).toMatchObject({
      targetId: 'ssh-elice',
      jobId: '4242',
      runId: 'c-seed-42',
      origin: 'run-exec',
      manifestState: null,
      state: 'running'
    })
    expect(
      harnessSlurmRunLink('ssh-elice', null, { manifestPath: path, jobId: 'x; rm -rf' }, 'T')
    ).toBeNull()
  })
})
