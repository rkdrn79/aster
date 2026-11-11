import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as RebuttalFiles from './research-rebuttal-files'
import {
  newRebuttalMeta,
  parseRebuttalMeta,
  serializeRebuttalJson
} from '../../../../research-harness/research-rebuttal-model.mjs'
import {
  parseClusters,
  parsePoints
} from '../../../../research-harness/research-rebuttal-points.mjs'

type FilesModule = typeof RebuttalFiles

const { disk, listing } = vi.hoisted(() => ({
  disk: new Map<string, string>(),
  listing: new Map<string, string[]>()
}))

vi.mock('./research-rebuttal-files', async (importOriginal) => {
  const actual: FilesModule = await importOriginal()
  return {
    ...actual,
    listRebuttalDirectory: async (_owner: unknown, directory: string) =>
      listing.has(directory)
        ? listing.get(directory)!.map((name) => ({ name, isDirectory: !name.includes('.') }))
        : null,
    readRebuttalText: async (_owner: unknown, path: string) => {
      if (!disk.has(path)) {
        throw new Error(`ENOENT ${path}`)
      }
      return disk.get(path)!
    },
    statRebuttalFile: async () => 'stat',
    writeRebuttalText: async (
      _owner: unknown,
      path: string,
      content: string,
      previous: string | null
    ) => {
      const current = disk.get(path) ?? null
      if (current !== previous) {
        throw new actual.RebuttalWriteConflict(path)
      }
      disk.set(path, content)
      const folder = path.slice(0, path.lastIndexOf('/'))
      listing.set(folder, [
        ...new Set([...(listing.get(folder) ?? []), path.slice(path.lastIndexOf('/') + 1)])
      ])
    }
  }
})

vi.mock('./research-rebuttal-store', async () => {
  const { loadRebuttalSnapshot } = await import('./research-rebuttal-snapshot')
  return {
    openRebuttalProject: vi.fn(),
    reloadRebuttal: (owner: RebuttalOwner) => loadRebuttalSnapshot(owner, '.aster/rebuttal', 'iclr')
  }
})

vi.mock('@/store', () => ({ useAppStore: { getState: () => ({ openFiles: [] }) } }))

import type { RebuttalOwner } from './research-rebuttal-files'
import {
  acceptRebuttalProposal,
  discardRebuttalProposal,
  listReplyVersions,
  restoreReplyVersion,
  saveRebuttalReply
} from './research-rebuttal-reply-mutations'
import { loadRebuttalSnapshot } from './research-rebuttal-snapshot'
import { convertRebuttalPrediction, dismissRebuttalPrediction } from './research-rebuttal-decisions'
import { approveRebuttalPaperChanges } from './research-rebuttal-paper-changes'

const owner: RebuttalOwner = { hostId: 'local', workspaceId: 'ws', workspacePath: '/project' }
const dir = '.aster/rebuttal/iclr'
const reviews = { R1: 'No DiffusionDet comparison. The ablation is missing.' }

function put(name: string, value: unknown): void {
  disk.set(`${dir}/${name}`, serializeRebuttalJson(value))
  listing.set(dir, [...new Set([...(listing.get(dir) ?? []), name])])
}

function seed(replyC1: string, author: string | null): void {
  disk.clear()
  listing.clear()
  listing.set('.aster/rebuttal', ['iclr'])
  const meta = parseRebuttalMeta({
    ...newRebuttalMeta({ name: 'ICLR', slug: 'iclr', now: '2026-11-07T00:00:00.000Z' }),
    reviewers: [{ id: 'R1', label: '' }]
  })
  const points = parsePoints(
    [
      {
        id: 'R1-W1',
        kind: 'weakness',
        summary: 'No DiffusionDet',
        quote: 'No DiffusionDet comparison.'
      },
      { id: 'R1-W2', kind: 'weakness', summary: '', quote: 'The ablation is missing.' }
    ],
    { reviewers: meta.reviewers, reviews }
  )
  const clusters = parseClusters(
    [
      {
        id: 'C1',
        title: 'Baseline',
        points: ['R1-W1'],
        action: 'experiment',
        response: replyC1,
        author
      }
    ],
    { pointIds: points.map((point) => point.id) }
  )
  put('rebuttal.json', meta)
  put('points.json', { schemaVersion: 1, points })
  put('clusters.json', { schemaVersion: 1, clusters })
  disk.set(`${dir}/reviews/R1.md`, reviews.R1)
  listing.set(`${dir}/reviews`, ['R1.md'])
}

const snapshot = () => loadRebuttalSnapshot(owner, '.aster/rebuttal', 'iclr')
const cluster = async (id = 'C1') =>
  (await snapshot()).bundle.clusters.find((entry) => entry.id === id)!

function proposal(fields: Record<string, unknown>): void {
  put('proposals.json', {
    schemaVersion: 1,
    proposals: [
      {
        id: 'X1',
        slot: 'C1',
        applied: false,
        base: '',
        text: 'Agent text.',
        find: null,
        replace: null,
        turn: 't1',
        request: 'Shorter',
        at: '2026-11-07T00:00:00.000Z',
        ...fields
      }
    ]
  })
}

describe('rebuttal reply writes', () => {
  beforeEach(() => seed('My careful words.', 'human'))

  it('saves a person typing and keeps the earlier text as a version', async () => {
    await saveRebuttalReply(owner, {
      slot: 'C1',
      pointId: 'R1-W1',
      text: 'My careful words, edited.',
      base: 'My careful words.'
    })
    expect((await cluster()).response).toBe('My careful words, edited.')
    expect((await cluster()).author).toBe('human')
    expect((await listReplyVersions(await snapshot(), 'C1')).map((v) => v.what)).toEqual([
      'Before you edited'
    ])
    // The next autosave a moment later does not pile up versions.
    await saveRebuttalReply(owner, {
      slot: 'C1',
      pointId: 'R1-W1',
      text: 'My careful words, edited more.',
      base: 'My careful words, edited.'
    })
    expect(await listReplyVersions(await snapshot(), 'C1')).toHaveLength(1)
  })

  it('makes a concern with no group answerable from the first words typed', async () => {
    const slot = await saveRebuttalReply(owner, {
      slot: null,
      pointId: 'R1-W2',
      text: 'We will add the ablation.',
      base: ''
    })
    expect(slot).toBe('C2')
    const created = await cluster('C2')
    expect(created.points).toEqual(['R1-W2'])
    expect(created.author).toBe('human')
    expect(created.status).toBe('drafting')
  })

  it('accepting a suggestion replaces the reply and keeps both texts in Versions', async () => {
    proposal({ base: 'My careful words.', text: 'Agent suggestion.' })
    await acceptRebuttalProposal(owner, 'X1')
    expect((await cluster()).response).toBe('Agent suggestion.')
    expect((await cluster()).author).toBe('both')
    const snap = await snapshot()
    expect(snap.proposals).toEqual([])
    const versions = await listReplyVersions(snap, 'C1')
    expect(versions.map((v) => v.text)).toEqual(['My careful words.', 'Agent suggestion.'])
  })

  it('refuses a passage that left the reply and leaves everything in place', async () => {
    proposal({
      base: 'Old full text.',
      text: 'Old full text changed.',
      find: 'Old full text',
      replace: 'New'
    })
    await expect(acceptRebuttalProposal(owner, 'X1')).rejects.toThrow(/no longer in the reply/)
    expect((await cluster()).response).toBe('My careful words.')
    expect((await snapshot()).proposals).toHaveLength(1)
  })

  it('applies a passage around edits the person made after the agent read it', async () => {
    seed('Intro. The number is 45.', 'human')
    proposal({
      base: 'The number is 45.',
      text: 'The number is 45.1.',
      find: 'The number is 45.',
      replace: 'The number is 45.1.'
    })
    await acceptRebuttalProposal(owner, 'X1')
    expect((await cluster()).response).toBe('Intro. The number is 45.1.')
  })

  it('undoing an agent draft empties the reply it filled, and keeps it in Versions', async () => {
    seed('Agent text.', 'agent')
    proposal({ applied: true, base: '', text: 'Agent text.' })
    await discardRebuttalProposal(owner, 'X1')
    expect((await cluster()).response).toBe('')
    expect((await cluster()).author).toBeNull()
    expect((await listReplyVersions(await snapshot(), 'C1'))[0].what).toBe('Undone agent edit')
  })

  it('undoing an agent edit puts back the exact text from before it, in one step', async () => {
    seed('Agent rewrite.', 'both')
    proposal({ applied: true, base: 'My careful words.', text: 'Agent rewrite.' })
    await discardRebuttalProposal(owner, 'X1')
    expect((await cluster()).response).toBe('My careful words.')
    expect((await cluster()).author).toBe('human')
    expect((await snapshot()).proposals).toEqual([])
    const kept = await listReplyVersions(await snapshot(), 'C1')
    expect(kept.at(-1)).toMatchObject({ what: 'Undone agent edit', text: 'Agent rewrite.' })
  })

  it('refuses to undo an agent edit once the reply changed after it', async () => {
    seed('Edited again by hand.', 'both')
    proposal({ applied: true, base: 'My careful words.', text: 'Agent rewrite.' })
    await expect(discardRebuttalProposal(owner, 'X1')).rejects.toThrow(/Versions/)
    expect((await cluster()).response).toBe('Edited again by hand.')
  })

  it('an agent rewrite that landed while the person typed waits as a suggestion', async () => {
    seed('Agent rewrite.', 'both')
    proposal({ applied: true, base: 'My careful words.', text: 'Agent rewrite.' })
    // The editor still showed the person's text when they typed on.
    await saveRebuttalReply(owner, {
      slot: 'C1',
      pointId: 'R1-W1',
      text: 'My careful words, and more.',
      base: 'My careful words.'
    })
    expect((await cluster()).response).toBe('My careful words, and more.')
    expect((await snapshot()).proposals[0]).toMatchObject({
      applied: false,
      heldWhileTyping: true,
      base: 'My careful words, and more.',
      text: 'Agent rewrite.'
    })
  })

  it('a passage edit that landed while the person typed applies on top once they pause', async () => {
    seed('Intro. The number is 45.1.', 'both')
    proposal({
      applied: true,
      base: 'Intro. The number is 45.',
      text: 'Intro. The number is 45.1.',
      find: 'The number is 45.',
      replace: 'The number is 45.1.'
    })
    await saveRebuttalReply(owner, {
      slot: 'C1',
      pointId: 'R1-W1',
      text: 'New intro. The number is 45.',
      base: 'Intro. The number is 45.'
    })
    expect((await cluster()).response).toBe('New intro. The number is 45.1.')
    expect((await snapshot()).proposals[0]).toMatchObject({
      applied: true,
      base: 'New intro. The number is 45.',
      text: 'New intro. The number is 45.1.'
    })
    // Undo goes back to exactly what the person typed.
    await discardRebuttalProposal(owner, 'X1')
    expect((await cluster()).response).toBe('New intro. The number is 45.')
  })

  it('set to Ask first, a passage edit made while typing waits instead', async () => {
    seed('Intro. The number is 45.1.', 'both')
    const meta = JSON.parse(disk.get(`${dir}/rebuttal.json`)!)
    put('rebuttal.json', { ...meta, agentEdits: 'ask' })
    proposal({
      applied: true,
      base: 'Intro. The number is 45.',
      text: 'Intro. The number is 45.1.',
      find: 'The number is 45.',
      replace: 'The number is 45.1.'
    })
    await saveRebuttalReply(owner, {
      slot: 'C1',
      pointId: 'R1-W1',
      text: 'New intro. The number is 45.',
      base: 'Intro. The number is 45.'
    })
    expect((await cluster()).response).toBe('New intro. The number is 45.')
    expect((await snapshot()).proposals[0].applied).toBe(false)
  })

  it('the general intro saves like a reply, with versions', async () => {
    await saveRebuttalReply(owner, {
      slot: 'general:intro',
      pointId: null,
      text: 'We thank the reviewers.',
      base: ''
    })
    await saveRebuttalReply(owner, {
      slot: 'general:intro',
      pointId: null,
      text: 'We thank all reviewers.',
      base: 'We thank the reviewers.'
    })
    expect((await snapshot()).bundle.meta.general.intro).toBe('We thank all reviewers.')
    const kept = await listReplyVersions(await snapshot(), 'general:intro')
    expect(kept.map((version) => version.text)).toEqual(['We thank the reviewers.'])
  })

  it('discarding a suggestion leaves the reply alone', async () => {
    proposal({ base: 'My careful words.', text: 'Agent suggestion.' })
    await discardRebuttalProposal(owner, 'X1')
    expect((await cluster()).response).toBe('My careful words.')
    expect((await snapshot()).proposals).toEqual([])
  })

  it('an agent draft the person did not see stays as a suggestion, not lost', async () => {
    seed('Agent text.', 'agent')
    proposal({ applied: true, base: '', text: 'Agent text.' })
    // The editor started empty and the person typed before the draft arrived.
    await saveRebuttalReply(owner, {
      slot: 'C1',
      pointId: 'R1-W1',
      text: 'Typed by hand.',
      base: ''
    })
    expect((await cluster()).response).toBe('Typed by hand.')
    expect((await snapshot()).proposals[0]).toMatchObject({
      applied: false,
      base: 'Typed by hand.',
      text: 'Agent text.'
    })
  })

  it('editing an agent draft the person saw closes the draft and marks it shared', async () => {
    seed('Agent text.', 'agent')
    proposal({ applied: true, base: '', text: 'Agent text.' })
    await saveRebuttalReply(owner, {
      slot: 'C1',
      pointId: 'R1-W1',
      text: 'Agent text, edited.',
      base: 'Agent text.'
    })
    expect((await cluster()).author).toBe('both')
    expect((await snapshot()).proposals).toEqual([])
  })

  it('restores any kept version and keeps the text it replaced', async () => {
    proposal({ base: 'My careful words.', text: 'Agent suggestion.' })
    await acceptRebuttalProposal(owner, 'X1')
    const versions = await listReplyVersions(await snapshot(), 'C1')
    await restoreReplyVersion(owner, 'C1', versions[0].id)
    expect((await cluster()).response).toBe('My careful words.')
    const after = await listReplyVersions(await snapshot(), 'C1')
    expect(after.map((v) => v.what)).toContain('Before restoring an earlier version')
  })

  it('writes every file through the conditional text path, also when saving repeatedly', async () => {
    const seen: string[] = []
    const files = await import('./research-rebuttal-files')
    const write = vi.spyOn(files, 'writeRebuttalText')
    write.mockImplementation(async (_o, path, content, previous) => {
      const current = disk.get(path) ?? null
      expect(current).toBe(previous)
      seen.push(path)
      disk.set(path, content)
    })
    for (let index = 0; index < 3; index += 1) {
      await saveRebuttalReply(owner, {
        slot: 'C1',
        pointId: 'R1-W1',
        text: `Round ${index}.`,
        base: index === 0 ? 'My careful words.' : `Round ${index - 1}.`
      })
    }
    expect(seen.filter((path) => path.endsWith('clusters.json')).length).toBe(3)
    expect(seen.every((path) => path.endsWith('.json'))).toBe(true)
    write.mockRestore()
  })
})

describe('next-concern decisions', () => {
  function predictions(): void {
    put('predictions.json', {
      schemaVersion: 1,
      predictions: [
        {
          id: 'R1-N1',
          reviewer: 'R1',
          concern: 'One budget is not enough.',
          why: 'Thin evidence.',
          likelihood: 'high',
          trigger: { cluster: 'C1', point: 'R1-W1', quote: null },
          preempt: 'Add the 36-epoch row.',
          status: 'open',
          basis: 'hash',
          predictedAt: '2026-11-07T00:00:00.000Z',
          convertedTo: null
        }
      ],
      outlooks: []
    })
  }

  beforeEach(() => {
    seed('My careful words.', 'human')
    predictions()
  })

  it('dismissing keeps the record, turned down', async () => {
    await dismissRebuttalPrediction(owner, 'R1-N1')
    expect((await snapshot()).predictions[0].status).toBe('dismissed')
  })

  it('turning one into a concern adds an anticipated point and its own group', async () => {
    await convertRebuttalPrediction(owner, 'R1-N1')
    const snap = await snapshot()
    const point = snap.bundle.points.find((entry) => entry.origin === 'prediction')!
    expect(point.fromPrediction).toBe('R1-N1')
    expect(point.id).toBe('R1-W3')
    expect(snap.predictions[0]).toMatchObject({ status: 'converted', convertedTo: 'R1-W3' })
    expect(snap.bundle.clusters.find((entry) => entry.points.includes(point.id))?.plan).toBe(
      'Add the 36-epoch row.'
    )
  })
})

describe('paper changes', () => {
  beforeEach(() => {
    seed('My careful words.', 'human')
    disk.set('paper/main.tex', 'We use a noise schedule.\nMore text.\n')
    put('paper-changes.json', {
      schemaVersion: 1,
      changes: [
        {
          id: 'E1',
          cluster: 'C1',
          promise: null,
          file: 'paper/main.tex',
          find: 'We use a noise schedule.',
          replace: 'We use a cosine noise schedule.',
          why: 'Undefined.',
          status: 'pending',
          at: '',
          decidedAt: null
        },
        {
          id: 'E2',
          cluster: 'C1',
          promise: null,
          file: 'paper/main.tex',
          find: 'Not in the paper.',
          replace: 'x',
          why: 'Stale.',
          status: 'pending',
          at: '',
          decidedAt: null
        },
        {
          id: 'E3',
          cluster: 'C1',
          promise: null,
          file: 'paper/main.tex',
          find: 'More text.',
          replace: 'More text, defined.',
          why: 'Second edit to the same file.',
          status: 'pending',
          at: '',
          decidedAt: null
        }
      ]
    })
  })

  it('Apply all applies what still fits in one write and reports the rest', async () => {
    const failed = await approveRebuttalPaperChanges(owner, ['E1', 'E2', 'E3'])
    expect(failed).toEqual([
      { id: 'E2', reason: 'Not applied: The passage is no longer in the file.' }
    ])
    expect(disk.get('paper/main.tex')).toBe(
      'We use a cosine noise schedule.\nMore text, defined.\n'
    )
    const changes = (await snapshot()).paperChanges
    expect(changes.map((change) => change.status)).toEqual(['applied', 'pending', 'applied'])
  })
})
