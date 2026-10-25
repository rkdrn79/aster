import { describe, expect, it } from 'vitest'
import type { ResearchLoopLedger } from '../../../../shared/research/research-harness-results'
import { LOOP_IDLE_MS, researchLoopBudgetText, researchLoopProgress } from './research-loop-format'

describe('loop budget text', () => {
  it('shows used against the limit, rounding hours to what matters', () => {
    expect(
      researchLoopBudgetText({
        maxRuns: 12,
        runsUsed: 4,
        maxHours: 8,
        hoursElapsed: 1.234,
        exhausted: false
      })
    ).toBe('4 of 12 loop runs · 1.2 of 8 h')
    expect(
      researchLoopBudgetText({
        maxRuns: null,
        runsUsed: 1,
        maxHours: 48,
        hoursElapsed: 12.6,
        exhausted: false
      })
    ).toBe('1 loop run · 13 of 48 h')
  })
})

const START = Date.parse('2026-10-24T00:00:00.000Z')
const HOUR = 3_600_000

function entry(kind: string, hours: number, text = kind): ResearchLoopLedger['entries'][number] {
  const at = new Date(START + hours * HOUR).toISOString()
  return { id: `${kind}-${hours}`, at, kind, text, hypothesis: null, run: null }
}

function ledger(entries: [kind: string, hours: number, text?: string][]): ResearchLoopLedger {
  const objective = entry('objective', 0)
  const all = [objective, ...entries.map(([kind, hours, text]) => entry(kind, hours, text))]
  return {
    experiment: 'exp',
    objective: { ...objective, data: null },
    budget: { maxRuns: 3, runsUsed: 2, maxHours: 4, hoursElapsed: 23, exhausted: true },
    counts: {},
    openHypotheses: [],
    entries: all
  }
}

describe('loop progress', () => {
  it('stops the clock at a stop decision, so an ended loop is not over budget', () => {
    const progress = researchLoopProgress(
      ledger([
        ['run', 1],
        ['decision', 3, 'stop: target met']
      ]),
      {
        running: false,
        now: START + 23 * HOUR
      }
    )
    expect(progress).toMatchObject({ phase: 'ended', hoursElapsed: 3, overBudget: false })
    expect(progress.stoppedAt).toBe(new Date(START + 3 * HOUR).toISOString())
  })

  it('waits on a checkpoint, and ends after an idle hour only when no Run is running', () => {
    const now = START + 2 * HOUR
    expect(researchLoopProgress(ledger([['checkpoint', 1]]), { running: false, now }).phase).toBe(
      'waiting'
    )
    const quiet = ledger([['run', 2 - LOOP_IDLE_MS / HOUR]])
    expect(researchLoopProgress(quiet, { running: true, now }).phase).toBe('active')
    expect(researchLoopProgress(quiet, { running: false, now }).phase).toBe('ended')
  })

  it('counts an active loop up to now and flags it past its hours', () => {
    const progress = researchLoopProgress(ledger([['run', 4.5]]), {
      running: true,
      now: START + 5 * HOUR
    })
    expect(progress).toMatchObject({ phase: 'active', hoursElapsed: 5, overBudget: true })
  })
})
