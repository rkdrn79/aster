import { describe, expect, it } from 'vitest'
import { budgetFit } from '../../../../research-harness/research-plan-fit.mjs'
import { cutConsequences, tierTotals } from '../../../../research-harness/research-plan-view.mjs'
import { researchPlanOverviewSchema } from '../../../../shared/research/research-plans'
import {
  EMPTY_SELECTION,
  applySuggestedCuts,
  approveBlockers,
  approveInput,
  cellsByTier,
  cutSet,
  decideRequest,
  initialSelection,
  proposedSummary,
  setCellsKept,
  setCutReason,
  tierChecked
} from './research-plan-view-state'

const cell = (id: string, extra: Record<string, unknown> = {}) => ({
  cell: id,
  stage: 'S2',
  question: 'Q1',
  purpose: 'main',
  tier: 'must',
  seeds: 3,
  cost: { total: 10, source: 'estimate' },
  ...extra
})

/** A small plan.json: two claims, a must and a should cell, and one "ask" request. */
function documentWith(gpuHours: number | null, source = 'user'): Record<string, unknown> {
  return {
    scope: { compute: { gpuHours, source } },
    claims: [
      { id: 'C1', text: 'Beats the baseline', weight: 'main', evidence: ['Q1'] },
      { id: 'C2', text: 'Works on another domain', weight: 'main', evidence: ['Q2'] }
    ],
    questions: [
      { id: 'Q1', claim: 'C1', text: 'Main comparison' },
      { id: 'Q2', claim: 'C2', text: 'Held-out domain' }
    ],
    matrix: [
      cell('S2.main'),
      cell('S4.heldout', {
        question: 'Q2',
        purpose: 'heldout',
        tier: 'should',
        cutReason: 'no time'
      })
    ],
    premortem: {
      requests: [
        {
          id: 'PM1',
          category: 'missing-dataset',
          request: 'Evaluate on a second domain',
          likelihood: 'high',
          resolution: { as: 'ask', items: ['S4.heldout'], reason: 'costs 10 h', costGpuHours: 10 }
        }
      ]
    }
  }
}

function overviewOf(document: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return researchPlanOverviewSchema.parse({
    plan: { id: 'p', title: 'Plan', status: 'submitted', revision: 4, ...extra },
    document,
    cells: [
      { cell: 'S2.main', effectiveTier: 'must', tier: 'must', cost: 10 },
      { cell: 'S4.heldout', effectiveTier: 'must', tier: 'should', cost: 10, cutReason: 'no time' }
    ],
    order: { stages: [] },
    premortem: {
      requests: [
        {
          id: 'PM1',
          request: 'Evaluate on a second domain',
          resolution: 'ask',
          cells: ['S4.heldout']
        }
      ],
      open: [],
      asks: ['PM1']
    },
    findings: [],
    summary: { fail: 0, warn: 0, info: 0 },
    cut: []
  })
}

describe('plan selection', () => {
  it('cuts with the agent suggested reason and keeps again', () => {
    const cells = [{ cell: 'S4.heldout', cutReason: 'no time' }]
    const cut = setCellsKept(EMPTY_SELECTION, cells, false)
    expect(cut.cuts.get('S4.heldout')).toBe('no time')
    expect(setCutReason(cut, 'S4.heldout', 'other venue').cuts.get('S4.heldout')).toBe(
      'other venue'
    )
    expect(setCellsKept(cut, cells, true).cuts.size).toBe(0)
    expect(setCutReason(EMPTY_SELECTION, 'S2.main', 'x')).toBe(EMPTY_SELECTION)
  })

  it('reports a tier checkbox as all, none or some', () => {
    const cut = setCellsKept(EMPTY_SELECTION, [{ cell: 'a', cutReason: null }], false)
    expect(tierChecked(cut, ['a', 'b'])).toBe('indeterminate')
    expect(tierChecked(cut, ['a'])).toBe(false)
    expect(tierChecked(cut, ['b'])).toBe(true)
  })

  it('leaving an ask request out cuts its cells; including keeps them', () => {
    const request = { id: 'PM1', cells: ['S4.heldout'] }
    const out = decideRequest(EMPTY_SELECTION, request, {
      decision: 'out-of-scope',
      reason: 'later'
    })
    expect(out.cuts.get('S4.heldout')).toBe('later')
    expect(out.decisions.get('PM1')?.decision).toBe('out-of-scope')
    const back = decideRequest(out, request, { decision: 'include', reason: '' })
    expect(back.cuts.has('S4.heldout')).toBe(false)
  })

  it('restores the approved cuts and decisions of the approved revision only', () => {
    const approval = {
      revision: 4,
      at: '2026-11-17T00:00:00Z',
      by: 'user',
      cuts: [{ cell: 'S4.heldout', reason: 'later' }],
      decisions: [{ request: 'PM1', decision: 'out-of-scope', reason: 'later' }],
      keptGpuHours: 10,
      budgetGpuHours: 20,
      openFindings: []
    }
    const approved = overviewOf(documentWith(20), { status: 'approved', approval })
    expect(initialSelection(approved).cuts.get('S4.heldout')).toBe('later')
    const revised = overviewOf(documentWith(20), { status: 'draft', approval, revision: 5 })
    expect(initialSelection(revised)).toBe(EMPTY_SELECTION)
  })
})

describe('approve blockers', () => {
  it('asks for compute first when the budget was assumed', () => {
    const document = documentWith(100, 'assumed')
    const blockers = approveBlockers(overviewOf(document), EMPTY_SELECTION, tierTotals(document))
    expect(blockers[0]).toMatch(/State your compute/u)
  })

  it('names the undecided ask, a missing reason and an over-budget selection', () => {
    const document = documentWith(15)
    const overview = overviewOf(document)
    const blockers = approveBlockers(overview, EMPTY_SELECTION, tierTotals(document))
    expect(blockers).toEqual([
      'Decide 1 reviewer request left to you (PM1).',
      'Kept runs need 20 of 15 GPU-h: cut more or state more compute.'
    ])
    const reasonless = decideRequest(
      EMPTY_SELECTION,
      { id: 'PM1', cells: ['S4.heldout'] },
      {
        decision: 'out-of-scope',
        reason: ' '
      }
    )
    expect(approveBlockers(overview, reasonless, tierTotals(document, cutSet(reasonless)))).toEqual(
      ['Give a reason for leaving out PM1.', 'Give an out-of-scope reason for 1 cut run.']
    )
  })

  it('is ready when every ask is decided, every cut has a reason and the rest fits', () => {
    const document = documentWith(15)
    const overview = overviewOf(document)
    const selection = decideRequest(
      EMPTY_SELECTION,
      { id: 'PM1', cells: ['S4.heldout'] },
      {
        decision: 'out-of-scope',
        reason: 'next paper'
      }
    )
    const cut = cutSet(selection)
    expect(approveBlockers(overview, selection, tierTotals(document, cut))).toEqual([])
    expect(approveInput(overview, selection)).toEqual({
      revision: 4,
      cuts: [{ cell: 'S4.heldout', reason: 'next paper' }],
      decisions: [{ request: 'PM1', decision: 'out-of-scope', reason: 'next paper' }]
    })
    const consequences = cutConsequences(document, cut)
    expect(consequences.claims.map((claim) => claim.id)).toEqual(['C2'])
    expect(consequences.requests.map((request) => [request.id, request.likelyDemand])).toEqual([
      ['PM1', true]
    ])
  })
})

describe('fit to the compute', () => {
  it('suggests the lowest-priority cut with what it loses, and taking it only unchecks it', () => {
    // 20 GPU-h of runs against 20: the 20% spare share leaves 16, so one run must go.
    const document = documentWith(20)
    const fit = budgetFit(document)
    expect(fit.plannableGpuHours).toBe(16)
    expect(fit.suggestions.map((entry) => entry.cell)).toEqual(['S2.main'])
    expect(fit.suggestions[0].loses.claims.map((claim) => claim.id)).toEqual(['C1'])
    const selection = applySuggestedCuts(EMPTY_SELECTION, fit.suggestions)
    expect(selection.cuts.get('S2.main')).toBe('Over the compute; lowest priority (main claim C1)')
    expect(budgetFit(document, cutSet(selection)).suggestions).toEqual([])
    const kept = setCellsKept(selection, [{ cell: 'S2.main', cutReason: null }], true)
    expect(kept.cuts.size).toBe(0)
  })

  it('keeps an existing reason and lists each tier highest priority first', () => {
    const document = documentWith(20)
    const [suggestion] = budgetFit(document).suggestions
    const mine = new Map([['S2.main', 'my reason']])
    expect(
      applySuggestedCuts({ ...EMPTY_SELECTION, cuts: mine }, [suggestion]).cuts.get('S2.main')
    ).toBe('my reason')
    const overview = overviewOf(document)
    const cells = overview.cells.map((entry, index) => ({
      ...entry,
      priority: { score: index, reasons: [] }
    }))
    expect(cellsByTier(cells).must.map((entry) => entry.cell)).toEqual(['S4.heldout', 'S2.main'])
  })
})

describe('proposed summary', () => {
  it('says where the runs were proposed', () => {
    expect(
      proposedSummary([
        { experiment: 'a', proposal: 'proposal-1' },
        { experiment: 'a', proposal: 'proposal-2' },
        { experiment: 'b', proposal: 'proposal-1' }
      ])
    ).toBe('2 runs proposed in a, 1 in b; approve each in its Experiment.')
    expect(proposedSummary([])).toMatch(/No runs were proposed/u)
  })
})
