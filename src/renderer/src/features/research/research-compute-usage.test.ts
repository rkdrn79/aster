import { describe, expect, it } from 'vitest'
import { makeRepo, makeWorktree } from '@/components/worktree-jump-palette-test-fixtures'
import type { Project } from '../../../../shared/project-types'
import type {
  ResearchComputeSample,
  ResearchSlurmJob
} from '../../../../shared/research/research-compute-probe'
import {
  collectResearchComputeUsage,
  countOpenProjectJobsByHost,
  groupResearchComputeUsageByProject
} from './research-compute-usage'
import {
  attributeResearchComputePath,
  selectResearchComputeWorkspaces,
  type ResearchComputeWorkspace
} from './research-compute-workspaces'
import { suggestComputeLinkFolders } from './research-compute-link-folders'

function workspace(path: string, projectName: string): ResearchComputeWorkspace {
  return {
    path,
    workspaceName: path.split('/').at(-1) ?? path,
    projectKey: `project:${projectName}`,
    projectName,
    badgeColor: null
  }
}

const lora = workspace('/data/projects/me/lora', 'LoRA')
const loraWorktree = workspace('/data/projects/me/lora/.worktrees/r16', 'LoRA ablation')
const lora2 = workspace('/data/projects/me/lora2', 'LoRA 2')

describe('attributeResearchComputePath', () => {
  it('picks the deepest workspace containing the directory and ignores sibling prefixes', () => {
    const workspaces = [lora, loraWorktree, lora2]
    const at = (cwd: string) =>
      attributeResearchComputePath({ cwd, command: null }, workspaces, {})?.workspace ?? null

    expect(at('/data/projects/me/lora/.worktrees/r16/scripts')).toBe(loraWorktree)
    expect(at('/data/projects/me/lora2')).toBe(lora2)
    expect(at('/data/projects/me/lora-old')).toBeNull()
  })

  it('matches the host-resolved path of a symlinked workspace', () => {
    expect(
      attributeResearchComputePath({ cwd: '/mnt/nfs/me/lora/runs', command: null }, [lora], {
        '/data/projects/me/lora': '/mnt/nfs/me/lora'
      })
    ).toEqual({ workspace: lora, matchedBy: 'cwd' })
  })

  it('falls back to an absolute path in the command or batch script', () => {
    expect(
      attributeResearchComputePath(
        { cwd: '/home/me', command: 'python -u /data/projects/me/lora2/train.py --out=/tmp/x' },
        [lora, lora2],
        {}
      )
    ).toEqual({ workspace: lora2, matchedBy: 'command' })
  })
})

function slurmJob(
  jobId: string,
  state: string,
  gpuCount: number,
  workDir: string
): ResearchSlurmJob {
  return {
    jobId,
    name: jobId,
    state,
    reason: state === 'PD' ? 'Priority' : null,
    partition: 'a100',
    nodeCount: 1,
    nodes: state === 'R' ? 'node01' : null,
    gpuCount,
    timeUsed: '0:00',
    timeLimit: '1:00:00',
    submitTime: null,
    startTime: null,
    workDir,
    command: null,
    comment: null
  }
}

function sample(
  targetId: string,
  overrides: Partial<ResearchComputeSample>
): ResearchComputeSample {
  return {
    targetId,
    capturedAt: '2026-10-23T00:00:00.000Z',
    status: 'ok',
    via: 'connection',
    message: null,
    remoteUser: 'me',
    gpu: { status: 'missing', message: null, devices: [], processes: [] },
    slurm: {
      status: 'ok',
      message: null,
      version: 'slurm 23.11.10',
      jobs: [],
      queue: [],
      queueTruncated: false,
      nodes: []
    },
    resolvedWorkspacePaths: {},
    ...overrides
  }
}

describe('groupResearchComputeUsageByProject', () => {
  it('sums running and pending GPUs per project across hosts and lists unmatched work last', () => {
    const gpu = sample('gpu', {
      slurm: {
        ...sample('gpu', {}).slurm,
        jobs: [
          slurmJob('20', 'PD', 4, '/data/projects/me/lora'),
          slurmJob('10', 'R', 2, '/data/projects/me/lora/runs'),
          slurmJob('30', 'PD', 1, '/data/projects/me/other')
        ]
      }
    })
    const gpuBox = sample('gpu-box', {
      slurm: { ...gpu.slurm, status: 'missing', jobs: [] },
      gpu: {
        status: 'ok',
        message: null,
        devices: [],
        processes: [
          {
            pid: 7,
            gpuUuid: 'GPU-0',
            usedMemoryMiB: 900,
            user: 'me',
            elapsedSeconds: 1,
            cwd: '/data/projects/me/lora',
            command: null
          },
          {
            pid: 7,
            gpuUuid: 'GPU-1',
            usedMemoryMiB: 900,
            user: 'me',
            elapsedSeconds: 1,
            cwd: '/data/projects/me/lora',
            command: null
          }
        ]
      }
    })

    const usages = groupResearchComputeUsageByProject(
      collectResearchComputeUsage([
        { targetId: 'gpu', hostLabel: 'GPU', sample: gpu, workspaces: [lora] },
        { targetId: 'gpu-box', hostLabel: 'gpu-box', sample: gpuBox, workspaces: [lora] }
      ])
    )

    expect(
      usages.map((usage) => [
        usage.projectName,
        usage.runningJobs,
        usage.runningGpus,
        usage.pendingJobs,
        usage.pendingGpus,
        usage.processGpus
      ])
    ).toEqual([
      ['LoRA', 1, 2, 1, 4, 2],
      [null, 0, 0, 1, 1, 0]
    ])
    expect(usages[0].jobs.map((entry) => entry.job.jobId)).toEqual(['10', '20'])
    expect(usages[0].processes.every((entry) => entry.ownedByRemoteUser)).toBe(true)
  })
})

describe('selectResearchComputeWorkspaces', () => {
  it('keeps only workspaces on the requested SSH target under their project name', () => {
    const remote = {
      ...makeRepo(),
      id: 'remote',
      path: '/data/projects/me/lora',
      connectionId: 'gpu'
    }
    const local = { ...makeRepo(), id: 'local', path: '/Users/me/lora' }
    const project: Project = {
      id: 'p1',
      displayName: 'LoRA study',
      badgeColor: '#336699',
      sourceRepoIds: ['remote', 'local'],
      createdAt: 0,
      updatedAt: 0
    }
    const state = {
      repos: [remote, local],
      worktreesByRepo: {
        remote: [
          makeWorktree('remote::/data/projects/me/lora-r16', 'r16', {
            repoId: 'remote',
            path: '/data/projects/me/lora-r16'
          })
        ],
        local: [
          makeWorktree('local::/Users/me/lora', 'main', { repoId: 'local', path: '/Users/me/lora' })
        ]
      },
      projects: [project],
      folderWorkspaces: [],
      projectGroups: []
    }

    expect(
      selectResearchComputeWorkspaces(state, 'gpu').map(({ path, projectName, badgeColor }) => [
        path,
        projectName,
        badgeColor
      ])
    ).toEqual([
      ['/data/projects/me/lora-r16', 'LoRA study', '#336699'],
      ['/data/projects/me/lora', 'LoRA study', '#336699']
    ])
    expect(selectResearchComputeWorkspaces(state, 'hpc')).toEqual([])
  })
})

describe('linked project folders', () => {
  it('files jobs under an open project on every cluster and ignores links to closed projects', () => {
    const captioning: Project = {
      id: 'captioning',
      displayName: 'Captioning',
      badgeColor: '#336699',
      sourceRepoIds: [],
      createdAt: 0,
      updatedAt: 0
    }
    const state = {
      repos: [],
      worktreesByRepo: {},
      projects: [captioning],
      folderWorkspaces: [],
      projectGroups: []
    }
    const links = [
      { targetId: 'gpu', remotePath: '/data/projects/me/Captioning', projectId: 'captioning' },
      { targetId: 'hpc', remotePath: '/home/me/Captioning', projectId: 'captioning' },
      { targetId: 'hpc', remotePath: '/home/me/OldPaper', projectId: 'closed-project' }
    ].map((link, index) => ({
      ...link,
      id: `00000000-0000-4000-8000-00000000000${index}`,
      projectName: 'saved name',
      createdAt: '2026-10-24T00:00:00.000Z'
    }))
    const jobsByHost = {
      gpu: [slurmJob('gpu-1', 'PD', 1, '/data/projects/me/Captioning/ablation')],
      hpc: [
        slurmJob('hpc-1', 'R', 2, '/home/me/Captioning'),
        slurmJob('hpc-2', 'PD', 1, '/home/me/OldPaper/rebuttal')
      ]
    }
    const hosts = (['gpu', 'hpc'] as const).map((targetId) => ({
      targetId,
      hostLabel: targetId,
      workspaces: selectResearchComputeWorkspaces(state, targetId, links),
      sample: sample(targetId, {
        slurm: { ...sample(targetId, {}).slurm, jobs: jobsByHost[targetId] }
      })
    }))

    const usages = groupResearchComputeUsageByProject(collectResearchComputeUsage(hosts))

    expect(
      usages.map((usage) => [usage.projectName, usage.jobs.map((entry) => entry.job.jobId)])
    ).toEqual([
      ['Captioning', ['hpc-1', 'gpu-1']],
      [null, ['hpc-2']]
    ])
    expect(Object.fromEntries(countOpenProjectJobsByHost(usages))).toEqual({
      hpc: { running: 1, pending: 0 },
      gpu: { running: 0, pending: 1 }
    })
  })

  it('suggests the folder under the signed-in user as the project root', () => {
    expect(suggestComputeLinkFolders('/data/projects/me/Captioning/ablation', 'me')).toEqual({
      folders: [
        '/data/projects/me/Captioning/ablation',
        '/data/projects/me/Captioning',
        '/data/projects/me',
        '/data/projects'
      ],
      preferred: '/data/projects/me/Captioning'
    })
    expect(suggestComputeLinkFolders('/scratch', null)).toEqual({
      folders: ['/scratch'],
      preferred: '/scratch'
    })
  })
})
