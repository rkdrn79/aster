import { describe, expect, it } from 'vitest'
import {
  newRebuttalMeta,
  parseRebuttalMeta
} from '../../../../research-harness/research-rebuttal-model.mjs'
import {
  parseClusters,
  parsePoints
} from '../../../../research-harness/research-rebuttal-points.mjs'
import { buildRebuttalPrompt } from './research-rebuttal-agent-prompts'
import {
  buildReviewerOpenPrompt,
  buildReviewerPredictPrompt,
  reviewerBrief,
  reviewerRepliesContext
} from './research-rebuttal-reviewer-prompts'
import type { RebuttalSnapshot } from './research-rebuttal-snapshot'

function snapshot(): RebuttalSnapshot {
  const reviews = { R1: 'The DiffusionDet comparison is missing.' }
  const meta = parseRebuttalMeta({
    ...newRebuttalMeta({
      name: 'ICLR 2027',
      slug: 'iclr-2027',
      venue: 'ICLR 2027',
      now: '2026-11-07T00:00:00.000Z'
    }),
    reviewers: [{ id: 'R1', label: 'Reviewer Xy12', rating: '4', confidence: '5' }]
  })
  const points = parsePoints(
    [
      {
        id: 'R1-W1',
        kind: 'weakness',
        summary: 'Baseline',
        quote: 'The DiffusionDet comparison is missing.'
      }
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
        response: 'We ran it.'
      }
    ],
    { pointIds: ['R1-W1'] }
  )
  return {
    owner: { hostId: 'local', workspaceId: 'ws', workspacePath: '/project' },
    directory: '.aster/rebuttal/iclr-2027',
    bundle: { meta, points, clusters, promises: [] },
    reviews,
    followUps: [],
    proposals: [],
    predictions: [],
    outlooks: [],
    paperChanges: [],
    translations: [],
    texts: {
      meta: null,
      points: null,
      clusters: null,
      promises: null,
      followUps: null,
      proposals: null,
      predictions: null,
      paperChanges: null,
      translations: null
    },
    issues: [],
    version: ''
  }
}

describe('simulated reviewer prompts', () => {
  it('brief names the reviewer, score and confidence and says it is a simulation', () => {
    const text = reviewerBrief(snapshot(), 'R1').join('\n')
    expect(text).toMatch(/You are NOT the real reviewer/)
    expect(text).toContain('Reviewer Xy12')
    expect(text).toContain('Score given: 4. Confidence: 5.')
    expect(text).toContain('The DiffusionDet comparison is missing.')
  })

  it('tells the agent it critiques, and allows only reading and predictions', () => {
    const text = reviewerBrief(snapshot(), 'R1').join('\n')
    expect(text).toContain('You critique; you do not write the rebuttal.')
    expect(text).toContain('rebuttal reviewer-context --reviewer R1')
    expect(text).toContain('rebuttal predictions set --reviewer R1')
    expect(text).toMatch(/Never run `rebuttal response`/)
    expect(text).toMatch(/never edit the manuscript/)
  })

  it('points the simulated reviewer at the Rebuttal guide this Aster ships', () => {
    const text = reviewerBrief(snapshot(), 'R1').join('\n')
    expect(text).toContain('aster skills get aster-research-track --section Rebuttal')
  })

  it('stays in character and uses no invented results', () => {
    const text = reviewerBrief(snapshot(), 'R1').join('\n')
    expect(text).toMatch(/Concede plainly/)
    expect(text).toMatch(/Never make up results/)
  })

  it('opens with a short introduction and a visible simulation label', () => {
    const prompt = buildReviewerOpenPrompt(snapshot(), 'R1')
    expect(prompt).toMatch(/Introduce yourself as the simulated Reviewer Xy12/)
    expect(prompt).toContain('aster-context Simulated R1')
  })

  it('a chat that starts with a request skips the introduction and carries the request', () => {
    const prompt = buildReviewerOpenPrompt(snapshot(), 'R1', 'Predict what you would raise next.')
    expect(prompt).not.toMatch(/then wait/)
    expect(prompt).toContain('aster-context Simulated R1')
    expect(prompt.endsWith('Predict what you would raise next.')).toBe(true)
  })

  it('prediction asks for the structured fields and to save them, and never to rewrite', () => {
    const prompt = buildReviewerPredictPrompt(snapshot(), 'R1')
    expect(prompt).toContain('"concern"')
    expect(prompt).toContain('"trigger"')
    expect(prompt).toContain('"preempt"')
    expect(prompt).toContain('rebuttal predictions set --rebuttal iclr-2027 --reviewer R1')
    expect(prompt).toMatch(/Do not write replies/)
    // Why not an outlook: on 10 real threads it said "same" every time and was right 4 times.
    expect(prompt).not.toContain('"outlook"')
    expect(prompt).toContain('A reply left empty has not been written')
  })

  it('attaches the current replies for the simulated reviewer to judge', () => {
    expect(reviewerRepliesContext(snapshot(), 'R1')).toContain('We ran it.')
    const empty = snapshot()
    empty.bundle.clusters = []
    expect(reviewerRepliesContext(empty, 'R1')).toBeNull()
  })
})

describe('author-side prompts', () => {
  it('passes the turn, says edits apply and can be undone, and forbids invented results', () => {
    const prompt = buildRebuttalPrompt(
      snapshot(),
      { kind: 'draft', scope: { kind: 'all' } },
      't123'
    )
    expect(prompt).toContain('--turn t123')
    expect(prompt).toMatch(/Never invent results, numbers, or citations/)
    expect(prompt).toMatch(/keeps the earlier text as a version first/)
    expect(prompt).toMatch(/can undo your edit with one click/)
  })

  it('set to Ask first, tells the agent its text over a written reply waits', () => {
    const ask = snapshot()
    ask.bundle.meta = { ...ask.bundle.meta, agentEdits: 'ask' }
    const prompt = buildRebuttalPrompt(
      ask,
      { kind: 'revise', slot: 'C1', passage: null, instruction: 'Shorter' },
      't1'
    )
    expect(prompt).toMatch(/set to Ask first/)
    expect(prompt).toMatch(/Your version waits for the person to accept it/)
    expect(prompt).not.toMatch(/undo your edit/)
  })

  it('sends a revision with the exact passage through the revise command', () => {
    const prompt = buildRebuttalPrompt(
      snapshot(),
      { kind: 'revise', slot: 'C1', passage: 'We ran it.', instruction: 'Lead with the number' },
      't9'
    )
    expect(prompt).toContain('rebuttal response revise --cluster C1')
    expect(prompt).toContain('Lead with the number')
    expect(prompt).toContain('We ran it.')
  })
})
