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
import { planRegroup } from '../../../../research-harness/research-rebuttal-regroup.mjs'
import {
  regroupRecord,
  regroupsDocument,
  stateAfterPlan
} from '../../../../research-harness/research-rebuttal-regroup-records.mjs'

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
      if ((disk.get(path) ?? null) !== previous) {
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
  acceptRebuttalRegroup,
  forgetRebuttalRegroup,
  holdRebuttalRegroup,
  regroupStateOf,
  restoreArchivedRebuttalGroup,
  undoRebuttalRegroup
} from './research-rebuttal-regroup-mutations'
import { listReplyVersions, saveRebuttalReply } from './research-rebuttal-reply-mutations'
import { loadRebuttalSnapshot } from './research-rebuttal-snapshot'

const owner: RebuttalOwner = { hostId: 'local', workspaceId: 'ws', workspacePath: '/project' }
const dir = '.aster/rebuttal/iclr'
const reviews = { R1: 'No baseline. No ablation.', R2: 'Baseline missing.' }
const snapshot = () => loadRebuttalSnapshot(owner, '.aster/rebuttal', 'iclr')
const clusters = async () => (await snapshot()).bundle.clusters

function put(name: string, value: unknown): void {
  disk.set(`${dir}/${name}`, serializeRebuttalJson(value))
  listing.set(dir, [...new Set([...(listing.get(dir) ?? []), name])])
}

function seed(agentEdits: 'apply' | 'ask' = 'apply'): void {
  disk.clear()
  listing.clear()
  listing.set('.aster/rebuttal', ['iclr'])
  const meta = parseRebuttalMeta({
    ...newRebuttalMeta({ name: 'ICLR', slug: 'iclr', now: '' }),
    reviewers: [
      { id: 'R1', label: '' },
      { id: 'R2', label: '' }
    ],
    agentEdits
  })
  const points = parsePoints(
    [
      { id: 'R1-W1', kind: 'weakness', summary: 'Baseline', quote: 'No baseline.' },
      { id: 'R1-W2', kind: 'weakness', summary: 'Ablation', quote: 'No ablation.' },
      { id: 'R2-W1', kind: 'weakness', summary: 'Baseline', quote: 'Baseline missing.' }
    ],
    { reviewers: meta.reviewers, reviews }
  )
  const groups = parseClusters(
    [
      {
        id: 'C1',
        title: 'Baseline',
        points: ['R1-W1'],
        action: 'clarify',
        response: 'Mine.',
        author: 'human'
      },
      {
        id: 'C2',
        title: 'Baseline too',
        points: ['R2-W1'],
        action: 'clarify',
        response: 'Agent text.',
        author: 'agent'
      },
      {
        id: 'C3',
        title: 'Ablation',
        points: ['R1-W2'],
        action: 'clarify',
        response: 'Appendix.',
        author: 'human'
      }
    ],
    { pointIds: points.map((point) => point.id) }
  )
  put('rebuttal.json', meta)
  put('points.json', { schemaVersion: 1, points })
  put('clusters.json', { schemaVersion: 1, clusters: groups })
  for (const [id, text] of Object.entries(reviews)) {
    disk.set(`${dir}/reviews/${id}.md`, text)
  }
  listing.set(`${dir}/reviews`, ['R1.md', 'R2.md'])
}

const mergeInput = [
  {
    id: 'C1',
    title: 'Baseline',
    points: ['R1-W1', 'R2-W1'],
    action: 'clarify',
    response: 'One answer.'
  },
  { id: 'C3', title: 'Ablation', points: ['R1-W2'], action: 'clarify' }
]

/** Lands the agent's merge of C2 into C1 the way the harness does, applied or waiting. */
async function agentMerges(applied: boolean, supplied = true): Promise<void> {
  const state = regroupStateOf(await snapshot())
  const input = supplied ? mergeInput : mergeInput.map(({ response: _r, ...rest }) => rest)
  const plan = planRegroup(state, {
    clusters: input,
    supplied: new Map(supplied ? [['C1', 'One answer.']] : [])
  })
  const record = regroupRecord(state, plan, {
    id: 'G1',
    at: '',
    applied,
    change: { clusters: input },
    supplied: new Map(supplied ? [['C1', 'One answer.']] : [])
  })
  const next = applied ? stateAfterPlan(state, plan, record) : { ...state, regroups: [record] }
  if (applied) {
    put('clusters.json', { schemaVersion: 1, clusters: next.clusters })
  }
  put('regroups.json', regroupsDocument(next))
}

describe('regroups on the Rebuttal page', () => {
  beforeEach(() => seed())

  it('Undo puts the exact groups and replies back in one step', async () => {
    const before = await clusters()
    await agentMerges(true)
    expect((await clusters()).map((entry) => entry.id)).toEqual(['C1', 'C3'])
    await undoRebuttalRegroup(owner, 'G1')
    expect(await clusters()).toEqual(before)
    expect((await snapshot()).regroups).toEqual([])
    const kept = await listReplyVersions(await snapshot(), 'C1')
    expect(kept.at(-1)).toMatchObject({ what: 'Undone regroup', text: 'One answer.' })
  })

  it('refuses Undo once an affected reply was edited, and points to Versions', async () => {
    await agentMerges(true)
    await saveRebuttalReply(owner, {
      slot: 'C1',
      pointId: null,
      text: 'One answer, edited.',
      base: 'One answer.'
    })
    await expect(undoRebuttalRegroup(owner, 'G1')).rejects.toThrow(/C1 changed .* Versions/)
  })

  it('holding a regroup that landed while typing puts the groups back and keeps it waiting', async () => {
    const before = await clusters()
    await agentMerges(true)
    await holdRebuttalRegroup(owner, 'G1')
    expect(await clusters()).toEqual(before)
    expect((await snapshot()).regroups[0]).toMatchObject({ applied: false, heldWhileTyping: true })
  })

  it('accepting a waiting regroup uses the merged reply when the replies are unchanged', async () => {
    seed('ask')
    await agentMerges(false)
    await acceptRebuttalRegroup(owner, 'G1')
    expect((await clusters()).find((entry) => entry.id === 'C1')?.response).toBe('One answer.')
    expect((await snapshot()).regroups[0].applied).toBe(true)
  })

  it('accepting after the person changed a merged reply joins the current replies instead', async () => {
    seed('ask')
    await agentMerges(false)
    await saveRebuttalReply(owner, {
      slot: 'C2',
      pointId: null,
      text: 'Typed later.',
      base: 'Agent text.'
    })
    await acceptRebuttalRegroup(owner, 'G1')
    expect((await clusters()).find((entry) => entry.id === 'C1')?.response).toBe(
      'Mine.\n\nTyped later.'
    )
  })

  it('discarding a waiting regroup changes nothing', async () => {
    seed('ask')
    const before = await clusters()
    await agentMerges(false)
    await forgetRebuttalRegroup(owner, 'G1')
    expect(await clusters()).toEqual(before)
    expect((await snapshot()).regroups).toEqual([])
  })

  it('a removed group with a reply is restored from the archive in one step', async () => {
    const state = regroupStateOf(await snapshot())
    const plan = planRegroup(state, {
      clusters: mergeInput.slice(1).concat([{ ...mergeInput[0], points: ['R1-W1'] }])
    })
    put('clusters.json', { schemaVersion: 1, clusters: plan.clusters })
    put('regroups.json', regroupsDocument(stateAfterPlan(state, plan, null)))
    expect((await snapshot()).archive[0].cluster.id).toBe('C2')
    expect(await restoreArchivedRebuttalGroup(owner, 'A1')).toBe('C2')
    expect((await clusters()).find((entry) => entry.id === 'C2')?.response).toBe('Agent text.')
  })

  it('text typed into a group that was merged away is kept where its reply went', async () => {
    await agentMerges(true)
    await expect(
      saveRebuttalReply(owner, { slot: 'C2', pointId: null, text: 'Typing.', base: 'Agent text.' })
    ).rejects.toThrow(/merged into C1/)
    const kept = await listReplyVersions(await snapshot(), 'C1')
    expect(kept.some((version) => version.text === 'Typing.')).toBe(true)
  })
})
