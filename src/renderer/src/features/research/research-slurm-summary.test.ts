import { describe, expect, it } from 'vitest'
import type { ResearchComputeSample } from '../../../../shared/research/research-compute-probe'
import {
  isSlurmNodeSchedulable,
  slurmPendingReasonHint,
  summarizeSlurmHost,
  summarizeSlurmPartitions
} from './research-slurm-summary'

describe('isSlurmNodeSchedulable', () => {
  it('reads sinfo StateLong spellings seen on real clusters', () => {
    const states = [
      'mixed',
      'mixed-',
      'allocated',
      'idle~',
      'down*',
      'drained',
      'idle+drain',
      'mixed*'
    ]

    expect(states.map((state) => [state, isSlurmNodeSchedulable(state)])).toEqual([
      ['mixed', true],
      ['mixed-', true],
      ['allocated', true],
      ['idle~', true],
      ['down*', false],
      ['drained', false],
      ['idle+drain', false],
      ['mixed*', false]
    ])
  })
})

describe('summarizeSlurmPartitions', () => {
  it('counts unallocated GPUs only on schedulable nodes and pending jobs in every listed partition', () => {
    const sample: Pick<ResearchComputeSample, 'slurm' | 'remoteUser'> = {
      remoteUser: 'me',
      slurm: {
        status: 'ok',
        message: null,
        version: null,
        jobs: [],
        queueTruncated: false,
        nodes: [
          {
            name: 'node01',
            partition: 'a100',
            state: 'mixed',
            gpuTypes: ['a100'],
            gpuTotal: 8,
            gpuUsed: 6
          },
          {
            name: 'node02',
            partition: 'a6000',
            state: 'idle',
            gpuTypes: ['a6000'],
            gpuTotal: 8,
            gpuUsed: 0
          },
          {
            name: 'node03',
            partition: 'a6000',
            state: 'down*',
            gpuTypes: ['a6000'],
            gpuTotal: 8,
            gpuUsed: 0
          }
        ],
        queue: [
          { user: 'bob', state: 'R', partition: 'a100', gpuCount: 4 },
          { user: 'me', state: 'R', partition: 'a100', gpuCount: 2 },
          { user: 'me', state: 'PD', partition: 'a6000,a100', gpuCount: 1 },
          { user: 'carol', state: 'PD', partition: 'a6000', gpuCount: 2 }
        ]
      }
    }

    expect(summarizeSlurmPartitions(sample)).toEqual([
      {
        partition: 'a100',
        nodeCount: 1,
        schedulableNodeCount: 1,
        gpuTypes: ['a100'],
        gpuTotal: 8,
        gpuAllocated: 6,
        gpuUnallocated: 2,
        runningJobs: 2,
        pendingJobs: 1,
        pendingGpus: 1,
        topGpuUsers: [
          { user: 'bob', gpus: 4 },
          { user: 'me', gpus: 2 }
        ],
        mine: { running: 1, pending: 1 }
      },
      {
        partition: 'a6000',
        nodeCount: 2,
        schedulableNodeCount: 1,
        gpuTypes: ['a6000'],
        gpuTotal: 16,
        gpuAllocated: 0,
        gpuUnallocated: 8,
        runningJobs: 0,
        pendingJobs: 2,
        pendingGpus: 3,
        topGpuUsers: [],
        mine: { running: 0, pending: 1 }
      }
    ])
  })
})

describe('slurmPendingReasonHint', () => {
  it('flags reasons that keep a job from ever starting', () => {
    expect(slurmPendingReasonHint('DependencyNeverSatisfied')?.blocking).toBe(true)
    expect(slurmPendingReasonHint('Priority')?.blocking).toBe(false)
    expect(slurmPendingReasonHint('QOSMaxGRESPerUser')?.text).toBe('At a QOS or account limit')
    expect(slurmPendingReasonHint('constructor')).toBeNull()
  })
})

describe('summarizeSlurmHost', () => {
  it('counts each node once across partitions and by GPU type', () => {
    const node = (
      name: string,
      partition: string,
      state: string,
      type: string,
      total: number,
      used: number
    ) => ({
      name,
      partition,
      state,
      gpuTypes: [type],
      gpuTotal: total,
      gpuUsed: used
    })
    const summary = summarizeSlurmHost({
      slurm: {
        status: 'ok',
        message: null,
        version: null,
        jobs: [],
        queueTruncated: false,
        nodes: [
          node('node01', 'a100', 'mixed', 'a100', 8, 6),
          node('node01', 'debug', 'mixed', 'a100', 8, 6),
          node('node02', 'a6000', 'idle', 'a6000', 8, 0),
          node('node03', 'a6000', 'down*', 'a6000', 8, 0)
        ],
        queue: [
          { user: 'bob', state: 'R', partition: 'a100', gpuCount: 4 },
          { user: 'me', state: 'PD', partition: 'a6000,a100', gpuCount: 2 }
        ]
      }
    })

    expect(summary).toEqual({
      gpuTotal: 24,
      gpuAllocated: 6,
      gpuUnallocated: 10,
      nodeCount: 3,
      schedulableNodeCount: 2,
      runningJobs: 1,
      pendingJobs: 1,
      pendingGpus: 2,
      byGpuType: [
        { type: 'a100', total: 8, allocated: 6 },
        { type: 'a6000', total: 16, allocated: 0 }
      ],
      nodes: [
        expect.objectContaining({ name: 'node01', gpuUsed: 6, gpuTotal: 8, schedulable: true }),
        expect.objectContaining({ name: 'node02', gpuUsed: 0, gpuTotal: 8, schedulable: true }),
        expect.objectContaining({ name: 'node03', gpuUsed: 0, gpuTotal: 8, schedulable: false })
      ]
    })
  })
})
