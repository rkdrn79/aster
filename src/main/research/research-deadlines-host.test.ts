import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type {
  ConferenceCatalogCache,
  ConferenceEdition
} from '../../shared/research/conference-deadlines'
import { readResearchDeadlines, updateResearchDeadlines } from './research-deadlines-host'

const fixture = vi.hoisted(() => ({ directory: '' }))
vi.mock('../persistence/loading-store/user-data-path', () => ({
  getCanonicalUserDataPath: () => fixture.directory
}))

function edition(
  series: string,
  rank: ConferenceEdition['rank'],
  deadlines: [stage: ConferenceEdition['deadlines'][number]['stage'], date: string][]
): ConferenceEdition {
  return {
    id: `${series}-2099`,
    series,
    title: series.toUpperCase(),
    year: 2099,
    tags: [],
    topic: 'ml',
    rank,
    deadlines: deadlines.map(([stage, date]) => ({
      type: stage,
      label: `${stage} deadline`,
      stage,
      date,
      timezone: 'AoE',
      source: 'huggingface'
    }))
  }
}

beforeAll(async () => {
  fixture.directory = await mkdtemp(join(tmpdir(), 'aster-research-deadlines-'))
  // A fresh cache, so no read starts a download.
  const cache: ConferenceCatalogCache = {
    schemaVersion: 2,
    snapshots: [
      {
        source: 'huggingface',
        fetchedAt: new Date().toISOString(),
        editions: [
          edition('icml', { core: 'A*' }, [
            ['submission', '2099-01-30 23:59'],
            ['rebuttal', '2099-03-20 23:59'],
            ['notification', '2099-05-01'],
            ['submission', '2000-01-01']
          ]),
          edition('smallconf', {}, [['submission', '2099-01-10 23:59']]),
          edition('neurips', { ccf: 'A' }, [['submission', '2099-05-15 23:59']])
        ]
      }
    ]
  }
  await mkdir(join(fixture.directory, 'research'))
  await writeFile(
    join(fixture.directory, 'research', 'conference-deadlines-catalog.json'),
    JSON.stringify(cache)
  )
})

afterAll(async () => {
  await rm(fixture.directory, { recursive: true, force: true })
})

describe('researchDeadlines', () => {
  it('suggests soon-closing top-tier conferences while nothing is tracked', async () => {
    const result = await readResearchDeadlines({})

    expect(result).toMatchObject({ revision: 0, trackedSeries: [], upcoming: [] })
    expect(result.catalog).toMatchObject({ status: 'present', stale: false, refreshing: false })
    expect(result.suggestions.map((entry) => [entry.series, entry.topTier])).toEqual([
      ['icml', true],
      ['neurips', true],
      ['smallconf', false]
    ])
  })

  it('tracks a series and a submission at a revision, then refuses a stale one', async () => {
    const saved = await updateResearchDeadlines({
      revision: 0,
      ops: [
        { op: 'track', series: 'ICML' },
        { op: 'setSubmission', editionId: 'icml-2099', status: 'submitted', project: 'id:wt-1' }
      ]
    })

    expect(saved.status).toBe('saved')
    expect(saved.deadlines).toMatchObject({ revision: 1, trackedSeries: ['icml'], suggestions: [] })
    const submission = { status: 'submitted', project: 'id:wt-1' }
    expect(saved.deadlines.upcoming).toMatchObject([
      // AoE is UTC-12, so the stated 23:59 is 11:59 UTC on the next day.
      {
        stage: 'submission',
        at: '2099-01-31T11:59:00.000Z',
        stated: { date: '2099-01-30 23:59', timezone: 'AoE' },
        aoeAssumed: false,
        actionable: false,
        submission
      },
      { stage: 'rebuttal', actionable: true, submission },
      { stage: 'notification', at: '2099-05-02T11:59:59.000Z', actionable: true }
    ])

    const stale = await updateResearchDeadlines({
      revision: 0,
      ops: [{ op: 'untrack', series: 'icml' }]
    })
    expect(stale.status).toBe('conflict')
    expect(stale.deadlines).toMatchObject({ revision: 1, trackedSeries: ['icml'] })
  })
})
