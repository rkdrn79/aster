import { describe, expect, it } from 'vitest'
import type { ResearchGpuHostBudget } from '../../../../shared/research/research-gpu-budget'
import { chooseResearchGpuPlacement } from './research-gpu-placement'

function budget(targetId: string, usedGpus: number, maxGpus = 4): ResearchGpuHostBudget {
  return {
    targetId,
    maxGpus,
    autoRelease: true,
    usedGpus,
    projects: [
      {
        projectKey: 'project:paper',
        projectName: 'Paper',
        maxGpus: null,
        priority: 'normal',
        usedGpus
      }
    ],
    held: []
  }
}

describe('chooseResearchGpuPlacement', () => {
  it('chooses a linked host with budget room before one that would hold the job', () => {
    const selected = chooseResearchGpuPlacement(
      [
        { targetId: 'gpu', label: 'GPU', workDir: '/gpu/paper', budget: budget('gpu', 4) },
        { targetId: 'hpc', label: 'HPC', workDir: '/hpc/paper', budget: budget('hpc', 1) }
      ],
      'project:paper',
      2
    )
    expect(selected).toMatchObject({ targetId: 'hpc', workDir: '/hpc/paper', held: false })
  })

  it('never interprets an unread budget or an unmapped project as available', () => {
    expect(
      chooseResearchGpuPlacement(
        [{ targetId: 'gpu', label: 'GPU', workDir: '/gpu/paper', budget: null }],
        'project:paper',
        1
      )
    ).toBeNull()
    expect(
      chooseResearchGpuPlacement(
        [{ targetId: 'gpu', label: 'GPU', workDir: '/gpu/paper', budget: budget('gpu', 0) }],
        'project:other',
        1
      )
    ).toBeNull()
  })
})
