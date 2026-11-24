import { describe, expect, it } from 'vitest'
import { groupResearchRunAttempts, researchRunAttempts } from './research-run-attempts'

// The repeated names of the 3D-LeWAM lewam-reproduction Experiment.
const runs = [
  {
    id: 'tworoom-grad-s42-1120-021424',
    name: 'tworoom grad seed 42',
    createdAt: '2026-11-19T17:14:24Z'
  },
  {
    id: 'tworoom-grad-s0-1120-021932',
    name: 'tworoom grad seed 0',
    createdAt: '2026-11-19T17:19:33Z'
  },
  {
    id: 'tworoom-grad-s42-1120-012834',
    name: 'tworoom grad seed 42',
    createdAt: '2026-11-19T16:28:34Z'
  },
  {
    id: 'tworoom-grad25-s0-1120-014639',
    name: 'tworoom grad25 seed 0',
    createdAt: '2026-11-19T16:46:39Z'
  },
  {
    id: 'tworoom-grad-s42-1120-015454',
    name: 'tworoom grad seed 42',
    createdAt: '2026-11-19T16:54:54Z'
  }
]

describe('Run attempts', () => {
  it('numbers Runs that share a name by when they were created', () => {
    expect(Object.fromEntries(researchRunAttempts(runs))).toEqual({
      'tworoom-grad-s42-1120-012834': { attempt: 1, of: 3 },
      'tworoom-grad-s42-1120-015454': { attempt: 2, of: 3 },
      'tworoom-grad-s42-1120-021424': { attempt: 3, of: 3 }
    })
  })

  it('groups attempts of one name together in Compare', () => {
    expect(groupResearchRunAttempts(runs).map((run) => run.id)).toEqual([
      'tworoom-grad-s42-1120-021424',
      'tworoom-grad-s42-1120-012834',
      'tworoom-grad-s42-1120-015454',
      'tworoom-grad-s0-1120-021932',
      'tworoom-grad25-s0-1120-014639'
    ])
  })
})
