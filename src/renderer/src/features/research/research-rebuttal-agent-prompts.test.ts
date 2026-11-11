import { describe, expect, it } from 'vitest'
import {
  newRebuttalMeta,
  parseRebuttalMeta
} from '../../../../research-harness/research-rebuttal-model.mjs'
import { parseClusters } from '../../../../research-harness/research-rebuttal-points.mjs'
import { buildRebuttalPrompt, requestSummary } from './research-rebuttal-agent-prompts'
import type { RebuttalSnapshot } from './research-rebuttal-snapshot'

function snapshot(): RebuttalSnapshot {
  const meta = parseRebuttalMeta({
    ...newRebuttalMeta({ name: 'ICLR 2027', slug: 'iclr-2027', now: '' }),
    reviewers: [{ id: 'R1', label: '' }]
  })
  return {
    owner: { hostId: 'local', workspaceId: 'ws', workspacePath: '/project' },
    directory: '.aster/rebuttal/iclr-2027',
    bundle: {
      meta,
      points: [],
      clusters: parseClusters(
        [{ id: 'C1', title: 'Baseline', points: ['R1-W1'], action: 'clarify' }],
        { pointIds: ['R1-W1'] }
      ),
      promises: []
    },
    reviews: { R1: '' },
    followUps: [],
    proposals: [],
    predictions: [],
    outlooks: [],
    paperChanges: [],
    translations: [],
    regroups: [],
    archive: [],
    texts: {
      meta: null,
      points: null,
      clusters: null,
      promises: null,
      followUps: null,
      proposals: null,
      predictions: null,
      paperChanges: null,
      translations: null,
      regroups: null
    },
    issues: [],
    version: ''
  }
}

const draft = { kind: 'draft', scope: { kind: 'cluster', clusterId: 'C1' } } as const

describe('Rebuttal agent prompts', () => {
  it('always point at the guide that matches this Aster, even where a skill is installed', () => {
    const prompt = buildRebuttalPrompt(snapshot(), draft, 't1')
    expect(prompt).toContain(
      'Read the Rebuttal guide first: `aster skills get aster-research-track --section Rebuttal` prints the version that matches this Aster.'
    )
    expect(prompt).toContain('On an older CLI without `--section`')
    expect(prompt).not.toMatch(/if the aster-research-track skill is not installed/i)
  })

  it('in English, say nothing about translating', () => {
    expect(buildRebuttalPrompt(snapshot(), draft, 't1', 'en')).not.toMatch(/translate/i)
  })

  it('in another reading language, translate each saved reply in the same turn', () => {
    const prompt = buildRebuttalPrompt(snapshot(), draft, 't1', 'ko')
    expect(prompt).toContain('The person reads along in Korean (한국어)')
    expect(prompt).toContain('Write the replies themselves in English')
    expect(prompt).toContain('rebuttal translate set --rebuttal iclr-2027 --language ko --file -')
    expect(prompt).toContain('"proposal":"X4"')
  })

  it('a translate request lists the outdated items and changes nothing else', () => {
    const request = { kind: 'translate', count: 3 } as const
    const prompt = buildRebuttalPrompt(snapshot(), request, 't1', 'ja')
    expect(prompt.split('\n')[0]).toBe('Translate 3 items for reading into 日本語.')
    expect(prompt).toContain('rebuttal translate list --rebuttal iclr-2027 --language ja --todo')
    expect(prompt).toMatch(/change no reply, concern or review/)
    expect(requestSummary({ kind: 'translate', count: 1 })).toBe('Translate 1 item for reading')
  })

  it('tells the agent it may regroup answered concerns and how replies are carried', () => {
    const split = buildRebuttalPrompt(snapshot(), { kind: 'split' }, 't1')
    expect(split).toContain(
      'Merging, splitting or removing groups that already have replies is allowed'
    )
    expect(split).toContain('send the merged reply as that group\'s "response"')
    expect(split).toContain('`clusters set` and `points set` command')
    expect(buildRebuttalPrompt(snapshot(), draft, 't1')).toMatch(/undo the whole regroup/)
  })
})
