import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir, userInfo } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { asterSlurmJobComment } from '../../shared/research/research-gpu-policy'
import { readResearchComputeStatus } from './research-compute-local-status'

const fixture = vi.hoisted(() => ({ directory: '' }))
vi.mock('../persistence/loading-store/user-data-path', () => ({
  getCanonicalUserDataPath: () => fixture.directory
}))

/** One `squeue -O` row: every field ends with the tab suffix the probe's format asks for. */
function squeueRow(fields: {
  id: string
  state: string
  reason: string
  nodes: string
  gpus: number
  comment: string
}): string {
  const tres = `cpu=8,mem=64G,node=1,gres/gpu=${fields.gpus}`
  return [
    fields.id,
    `job-${fields.id}`,
    fields.state,
    fields.reason,
    'gpu',
    '1',
    fields.nodes,
    tres,
    '1:02:03',
    '2-00:00:00',
    '2026-10-24T09:00:00',
    '2026-10-24T09:05:00',
    '/home/me/project',
    '/home/me/project/train.sh',
    fields.comment
  ]
    .map((field) => `${field}\t`)
    .join('')
}

const SQUEUE_OUTPUT = [
  squeueRow({
    id: '101',
    state: 'R',
    reason: 'None',
    nodes: 'gpu01',
    gpus: 2,
    comment: asterSlurmJobComment('project:abc', 'lora-r16/seed-1')
  }),
  squeueRow({ id: '102', state: 'PD', reason: 'Resources', nodes: '', gpus: 4, comment: '' }),
  squeueRow({
    id: '103',
    state: 'PD',
    reason: 'JobHeldUser',
    nodes: '',
    gpus: 1,
    comment: asterSlurmJobComment('project:abc')
  })
].join('\n')

let bin: string
let emptyBin: string
const originalPath = process.env.PATH

beforeAll(async () => {
  fixture.directory = await mkdtemp(join(tmpdir(), 'aster-research-compute-'))
  bin = join(fixture.directory, 'bin')
  emptyBin = join(fixture.directory, 'empty-bin')
  await mkdir(bin)
  await mkdir(emptyBin)
  await writeFile(join(fixture.directory, 'squeue.out'), `${SQUEUE_OUTPUT}\n`)
  // Builtins and absolute paths only: the test's PATH holds nothing but this script.
  await writeFile(
    join(bin, 'squeue'),
    `#!/bin/sh\nprintf '%s\\n' "$@" > '${fixture.directory}/args.txt'\nexec /bin/cat '${fixture.directory}/squeue.out'\n`
  )
  await chmod(join(bin, 'squeue'), 0o755)
  await mkdir(join(fixture.directory, 'research'))
  await writeFile(
    join(fixture.directory, 'research', 'gpu-policy.json'),
    JSON.stringify({
      schemaVersion: 1,
      hosts: [{ targetId: 'local', maxGpus: 8, autoRelease: true }],
      projects: [
        {
          targetId: 'local',
          projectKey: 'project:abc',
          projectName: 'LoRA',
          maxGpus: 4,
          priority: 'normal'
        }
      ]
    })
  )
})

afterEach(() => {
  process.env.PATH = originalPath
})

afterAll(async () => {
  await rm(fixture.directory, { recursive: true, force: true })
})

describe.skipIf(process.platform === 'win32')('researchCompute.status', () => {
  it("reads the user's jobs from this host's squeue and fills the local GPU budget", async () => {
    process.env.PATH = bin

    const result = await readResearchComputeStatus()

    const args = (await readFile(join(fixture.directory, 'args.txt'), 'utf8')).split('\n')
    expect(args.slice(0, 3)).toEqual(['-h', '-u', userInfo().username])
    expect(result.slurm.status === 'present' && result.slurm.value.jobs).toMatchObject([
      {
        id: '101',
        state: 'running',
        gpus: 2,
        nodes: 'gpu01',
        elapsed: '1:02:03',
        project: { key: 'project:abc', name: 'LoRA', run: 'lora-r16/seed-1' },
        heldByBudget: false
      },
      { id: '102', state: 'pending', reason: 'Resources', project: null },
      { id: '103', state: 'held', reason: 'JobHeldUser', heldByBudget: true }
    ])
    // The held job takes no GPUs until Aster releases it.
    expect(result.slurm).toMatchObject({ status: 'present', value: { usedGpus: 6 } })
    expect(result.budget).toMatchObject({
      status: 'present',
      value: {
        maxGpus: 8,
        usedGpus: 6,
        availableGpus: 2,
        projects: [{ key: 'project:abc', name: 'LoRA', maxGpus: 4, usedGpus: 2 }]
      }
    })
  })

  it('reports a host without squeue as absent and leaves the budget usage unknown', async () => {
    process.env.PATH = emptyBin

    const result = await readResearchComputeStatus()

    expect(result.slurm).toEqual({ status: 'absent' })
    expect(result.budget).toMatchObject({
      status: 'present',
      value: { maxGpus: 8, usedGpus: null, availableGpus: null }
    })
  })
})
