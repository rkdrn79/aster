import { describe, expect, it } from 'vitest'
import type { ResearchSlurmJob } from './research-compute-probe'
import {
  computeResearchGpuBudget,
  decideGpuSubmission,
  planGpuReleases,
  projectKeyForSlurmJob
} from './research-gpu-budget'
import {
  asterSlurmJobComment,
  projectKeyFromSlurmComment,
  type ResearchGpuPolicy
} from './research-gpu-policy'

const CAPTION = 'project:github:me/captioning'
const PAPER = 'repo:paper-uuid'

function job(
  jobId: string,
  state: string,
  gpuCount: number,
  extra: Partial<ResearchSlurmJob> = {}
): ResearchSlurmJob {
  return {
    jobId,
    name: jobId,
    state,
    reason: state === 'PD' ? 'Priority' : null,
    partition: 'a6000',
    nodeCount: 1,
    nodes: null,
    gpuCount,
    timeUsed: null,
    timeLimit: null,
    submitTime: null,
    startTime: null,
    workDir: null,
    command: null,
    comment: null,
    ...extra
  }
}

const heldFor = (projectKey: string) => ({
  reason: 'JobHeldUser',
  comment: asterSlurmJobComment(projectKey)
})

const policy: ResearchGpuPolicy = {
  schemaVersion: 1,
  hosts: [{ targetId: 'gpu', maxGpus: 8, autoRelease: true }],
  projects: [
    {
      targetId: 'gpu',
      projectKey: CAPTION,
      projectName: 'Captioning',
      maxGpus: 4,
      priority: 'high'
    },
    { targetId: 'gpu', projectKey: PAPER, projectName: 'Paper', maxGpus: null, priority: 'low' }
  ]
}

function budgetFor(jobs: ResearchSlurmJob[]) {
  const folders = [{ path: '/data/projects/me/paper', projectKey: PAPER }]
  const budget = computeResearchGpuBudget(policy, 'gpu', jobs, (entry) =>
    projectKeyForSlurmJob(entry, folders, {})
  )
  if (!budget) {
    throw new Error('expected a budget for gpu')
  }
  return budget
}

describe('GPU budget', () => {
  it('round-trips project keys through the sbatch comment tag', () => {
    expect(projectKeyFromSlurmComment(asterSlurmJobComment(CAPTION))).toBe(CAPTION)
    expect(projectKeyFromSlurmComment('nightly eval')).toBeNull()
  })

  it('counts running and queued GPUs per project, but not held ones', () => {
    const budget = budgetFor([
      job('10', 'R', 2, { comment: asterSlurmJobComment(CAPTION) }),
      job('11', 'PD', 1, { workDir: '/data/projects/me/paper/runs' }),
      job('12', 'PD', 4, heldFor(CAPTION)),
      job('13', 'R', 1)
    ])

    expect(budget.usedGpus).toBe(4)
    expect(budget.projects.map((project) => [project.projectName, project.usedGpus])).toEqual([
      ['Captioning', 2],
      ['Paper', 1]
    ])
    expect(budget.held).toEqual([{ jobId: '12', gpus: 4, projectKey: CAPTION, priority: 'high' }])
  })

  it('holds a new job that would pass the host max or its project cap', () => {
    const budget = budgetFor([job('10', 'R', 3, { comment: asterSlurmJobComment(CAPTION) })])

    expect(decideGpuSubmission(budget, CAPTION, 1).hold).toBe(false)
    expect(decideGpuSubmission(budget, CAPTION, 2)).toEqual({
      hold: true,
      reason: 'Captioning would use 5 of its 4 GPUs.'
    })
    expect(decideGpuSubmission(budget, PAPER, 6)).toEqual({
      hold: true,
      reason: 'Your GPUs on this host would reach 9 of your 8.'
    })
    expect(decideGpuSubmission(null, PAPER, 64).hold).toBe(false)
  })

  it('queues a new job behind held jobs it does not outrank', () => {
    const budget = budgetFor([
      job('10', 'R', 8, { workDir: '/data/projects/me/paper' }),
      job('12', 'PD', 2, heldFor(CAPTION))
    ])

    expect(decideGpuSubmission(budget, PAPER, 1)).toEqual({
      hold: true,
      reason: '1 held job is ahead of it.'
    })
  })

  it('releases held jobs by priority then age, skipping ones that would break a limit', () => {
    const budget = budgetFor([
      job('10', 'R', 2, { comment: asterSlurmJobComment(CAPTION) }),
      job('30', 'PD', 2, heldFor(PAPER)),
      job('21', 'PD', 2, heldFor(CAPTION)),
      job('20', 'PD', 1, heldFor(CAPTION)),
      job('31', 'PD', 4, heldFor(PAPER))
    ])

    // Captioning (high) goes first and stops at its cap of 4; Paper's 4-GPU job would pass 8.
    expect(planGpuReleases(budget)).toEqual(['20', '30'])
  })
})
