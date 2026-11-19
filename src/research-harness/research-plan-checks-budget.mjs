// Checklist F and G: costs, tiers against the stated compute (with a spare share and the cuts
// that would fit it), padding, run order, gates, stopping rules, executability, the team's load,
// comparability, and coverage of the reviewer pre-mortem.

import { comparisonCount } from './research-plan-checks-evaluation.mjs'
import { budgetFit, lossText } from './research-plan-fit.mjs'
import {
  COMMON_CATEGORY_IDS,
  REVIEW_CATEGORY_IDS,
  reviewCategory
} from './research-plan-reviewers.mjs'
import { TIERS, cellCost, finiteNumber, hasText, list, textList } from './research-plan-schema.mjs'
import {
  isLikelyDemand,
  planCellsView,
  premortemRequests,
  runOrder,
  tierTotals
} from './research-plan-view.mjs'

const MAX_CELLS_PER_STAGE = 12
const MAX_CELLS = 30
const MAX_COMPARISONS_WITHOUT_CORRECTION = 10
const MAIN_USES = ['main', 'heldout', 'generality']
const SUGGESTIONS_SHOWN = 6
/** The optional tier stays small: at most this many cells, or this share of all of them. */
const MAX_COULD_CELLS = 3
const MAX_COULD_SHARE = 0.1
/** Person-days to get a baseline running, by source; a cell to launch, check and read. */
const BASELINE_DAYS = { 'rerun-official-code': 2, reimplemented: 5, copied: 0 }
const CELL_DAYS = 0.25
const CODE_CELL_DAYS = 1
/** Share of the team's working days that experiments can take (the rest: writing, fixing). */
const TEAM_SHARE = 0.5

/** Joins the parts that apply into one sentence: capitalised, ended with a period. */
function sentence(parts) {
  const text = parts.filter(Boolean).join('; ')
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`
}

function hours(value) {
  return `${Number(value.toFixed(1))}`
}

function costChecks(plan, make) {
  const findings = []
  const cells = list(plan.matrix)
  const uncosted = cells.filter((cell) => cellCost(cell) === null)
  if (uncosted.length) {
    findings.push(
      make(
        'plan.cost-missing',
        uncosted[0].cell,
        `${uncosted.length} cell${uncosted.length === 1 ? ' has' : 's have'} no GPU-hour estimate: ${uncosted
          .map((cell) => cell.cell)
          .slice(0, 8)
          .join(
            ', '
          )}. Estimate from prior Runs, or add an S0 timing cell and mark the estimate provisional.`,
        uncosted.slice(0, 8).map((cell) => make.pointer('matrix', cell.cell, 'cell'))
      )
    )
  }
  const unsourced = cells.filter((cell) => cellCost(cell) !== null && !hasText(cell.cost?.source))
  if (unsourced.length) {
    findings.push(
      make(
        'plan.cost-unsourced',
        unsourced[0].cell,
        `${unsourced.length} cost estimate${unsourced.length === 1 ? ' has' : 's have'} no source (prior-run, paper, measured, timing-cell or estimate): ${unsourced
          .map((cell) => cell.cell)
          .slice(0, 8)
          .join(', ')}.`,
        unsourced.slice(0, 8).map((cell) => `${make.pointer('matrix', cell.cell, 'cell')}/cost`)
      )
    )
  }
  const grounded = cells.some((cell) =>
    ['prior-run', 'measured', 'paper'].includes(cell.cost?.source)
  )
  if (cells.length && !list(plan.costBasis).length && !grounded) {
    findings.push(
      make(
        'plan.cost-basis-missing',
        'costBasis',
        'Every cost is a bare estimate. Add costBasis: the few unit costs the cells are built from, each with its basis (a prior Run from `plan costs`, a number the paper reports, or `plan estimate` from parameters and tokens), so the person can check them.',
        ['/costBasis']
      )
    )
  }
  const untiered = cells.filter((cell) => !TIERS.includes(cell.tier))
  if (untiered.length) {
    findings.push(
      make(
        'plan.untiered',
        'matrix',
        `${untiered.length} cell${untiered.length === 1 ? ' has' : 's have'} no tier and count as must: ${untiered
          .map((cell) => cell.cell)
          .slice(0, 8)
          .join(', ')}.`,
        ['/matrix']
      )
    )
  }
  return findings
}

/** "S4.x (12 h; C3 weakened), S3.y (8 h)": the suggested cuts, lowest priority first. */
function suggestionText(fit) {
  const shown = fit.suggestions.slice(0, SUGGESTIONS_SHOWN).map((entry) => {
    const loss = lossText(entry.loses)
    return `${entry.cell} (${hours(entry.gpuHours)} h${loss ? `; ${loss}` : ''})`
  })
  const more = fit.suggestions.length - shown.length
  return `${shown.join(', ')}${more > 0 ? ` and ${more} more` : ''}`
}

function fitChecks(plan, make) {
  const findings = []
  const compute = plan.scope?.compute ?? {}
  const { budget, tiers, totalGpuHours } = tierTotals(plan)
  if (compute.source === 'assumed' || (budget.gpuHours !== null && !budget.stated)) {
    findings.push(
      make(
        'plan.budget-assumed',
        'scope',
        `The compute budget (${budget.gpuHours ?? '?'} GPU-h) was not stated by the person (source: ${compute.source ?? 'not given'}). Never invent one: ask, or leave it unknown and let the person pick a tier. GPUs and days the person named are stated: write them as scope.compute.gpus and days with source user.`,
        ['/scope/compute']
      )
    )
  } else if (budget.gpuHours === null) {
    findings.push(
      make(
        'plan.budget-unknown',
        'scope',
        `No compute stated: ask the person, or write the GPUs and days they named (scope.compute.gpus, days, source user). Tiers cost must ${hours(tiers[0].cumulativeGpuHours)}, should ${hours(tiers[1].cumulativeGpuHours)}, could ${hours(tiers[2].cumulativeGpuHours)} GPU-h cumulative.`,
        ['/scope/compute']
      )
    )
  }
  if (!budget.stated) {
    return findings
  }
  const fit = budgetFit(plan)
  const cuts = fit.suggestions.length
    ? ` Lowest priority first, cut ${suggestionText(fit)}${fit.fitsAfter ? '' : '; even then it does not fit'}.`
    : ''
  const must = tiers[0]
  if (!must.fits) {
    findings.push(
      make(
        'plan.over-budget',
        'must',
        `The must tier needs ${hours(must.cumulativeGpuHours)} GPU-h of the stated ${hours(budget.gpuHours)}. Make it fit (cheaper settings, fewer cells), or say so and ask the person for more compute.${cuts}`,
        ['/matrix', '/scope/compute']
      )
    )
  } else if (totalGpuHours > budget.gpuHours) {
    const fitting = tiers.filter((tier) => tier.fits).map((tier) => tier.tier)
    findings.push(
      make(
        'plan.cuts-needed',
        'tiers',
        `All tiers need ${hours(totalGpuHours)} GPU-h of ${hours(budget.gpuHours)}; ${fitting.join(' and ')} fit. Submit a plan that fits: drop or shrink low-priority cells yourself, and leave the person only real trade-offs.${cuts}`,
        ['/matrix']
      )
    )
  } else if (fit.overPlannableBy > 1e-9) {
    findings.push(
      make(
        'plan.no-reserve',
        'scope',
        `The cells take ${hours(totalGpuHours)} of ${hours(budget.gpuHours)} GPU-h, leaving less than ${Math.round(budget.reserve * 100)}% spare for reruns, debugging and the contingent analysis (scope.compute.reserve).${cuts}`,
        ['/scope/compute', '/matrix']
      )
    )
  }
  return findings
}

/** Checklist F: an optional tier kept small, and no cell that changes no decision. */
function paddingChecks(plan, make) {
  const findings = []
  const cells = planCellsView(plan)
  const could = cells.filter((cell) => cell.effectiveTier === 'could')
  const cap = Math.max(MAX_COULD_CELLS, Math.floor(cells.length * MAX_COULD_SHARE))
  if (could.length > cap) {
    const lowest = [...could].sort((left, right) => left.priority.score - right.priority.score)
    findings.push(
      make(
        'plan.optional-padding',
        'could',
        `${could.length} could cells (keep at most ${cap}): keep only those that answer a likely reviewer request and drop the rest, starting with ${lowest
          .slice(0, could.length - cap)
          .map((cell) => `${cell.cell} (priority ${cell.priority.score})`)
          .slice(0, 8)
          .join(', ')}.`,
        lowest.slice(0, 8).map((cell) => make.pointer('matrix', cell.cell, 'cell'))
      )
    )
  }
  const idle = cells.filter((cell) => cell.priority.score === 0 && hasText(cell.question))
  if (idle.length) {
    findings.push(
      make(
        'plan.no-decision',
        idle[0].cell,
        `${idle.length} cell${idle.length === 1 ? '' : 's'} support no claim, answer no reviewer request and feed no gate, so no result would change a decision: ${idle
          .map((cell) => cell.cell)
          .slice(0, 8)
          .join(', ')}. Drop them, or link each to the claim or request it decides.`,
        idle.slice(0, 8).map((cell) => make.pointer('matrix', cell.cell, 'cell'))
      )
    )
  }
  return findings
}

/** The people side of feasibility: getting baselines running and running every cell. */
function teamChecks(plan, make) {
  const team = plan.scope?.team ?? {}
  const people = finiteNumber(team.people)
  const weeks = finiteNumber(team.weeks)
  if (!people || !weeks) {
    return []
  }
  const baselines = list(plan.baselines).reduce(
    (sum, baseline) =>
      sum + (finiteNumber(baseline.effortDays) ?? BASELINE_DAYS[baseline.source] ?? 2),
    0
  )
  const cells = list(plan.matrix)
  const code = cells.filter((cell) => cell.needsCode === true).length
  const needed = baselines + code * CODE_CELL_DAYS + cells.length * CELL_DAYS
  const available = people * weeks * 5 * TEAM_SHARE
  if (needed <= available) {
    return []
  }
  return [
    make(
      'plan.team-overload',
      'scope',
      `About ${hours(needed)} person-days of experiment work (${list(plan.baselines).length} baselines to get running ≈ ${hours(baselines)}, ${code} cells needing code, ${cells.length} cells to run and read) against about ${hours(available)} for ${people} people over ${weeks} weeks at half time. Drop baselines that answer no likely request, copy numbers where the protocol matches, or merge cells.`,
      ['/scope/team', '/baselines', '/matrix']
    )
  ]
}

function orderChecks(plan, make) {
  const findings = []
  const { stages } = runOrder(plan)
  const cells = list(plan.matrix)
  if (!stages.length) {
    findings.push(
      make(
        'plan.no-sanity-stage',
        'stages',
        'The plan has no stages: start with a cheap S0 sanity stage with a numeric gate.',
        ['/stages']
      )
    )
    return findings
  }
  const first = stages[0]
  const others = stages.slice(1).filter((stage) => stage.cells.length)
  const cheapest = Math.min(...others.map((stage) => stage.gpuHours), Infinity)
  const problems = [
    !first.purposes.includes('sanity') && 'it has no sanity cell',
    first.gpuHours > cheapest &&
      `it costs ${hours(first.gpuHours)} GPU-h, more than a later stage (${hours(cheapest)})`
  ].filter(Boolean)
  if (problems.length) {
    findings.push(
      make(
        'plan.no-sanity-stage',
        first.id,
        `The first stage ${first.id} is not a cheap sanity stage: ${problems.join('; ')}.`,
        ['/stages/0']
      )
    )
  }
  const mainIndex = stages.findIndex((stage) => stage.purposes.includes('main'))
  const beforeMain = mainIndex === -1 ? stages : stages.slice(0, mainIndex + 1)
  const jump = beforeMain.findIndex(
    (stage, index) => index > 0 && stage.gpuHours < beforeMain[index - 1].gpuHours
  )
  if (jump > 0) {
    const dear = beforeMain[jump - 1]
    findings.push(
      make(
        'plan.order-not-cheap-first',
        dear.id,
        `Stage ${dear.id} (${hours(dear.gpuHours)} GPU-h) runs before the cheaper ${beforeMain[jump].id} (${hours(beforeMain[jump].gpuHours)} GPU-h): order sanity → cheap falsifier → main → ablations → generality.`,
        ['/stages']
      )
    )
  }
  const earlier = new Set(
    (mainIndex === -1 ? [] : stages.slice(0, mainIndex)).map((stage) => stage.id)
  )
  if (!cells.some((cell) => cell.purpose === 'pilot' && earlier.has(cell.stage))) {
    findings.push(
      make(
        'plan.no-cheap-falsifier',
        'stages',
        'No pilot cell before the main stage that could falsify the main hypothesis cheaply.',
        ['/stages']
      )
    )
  }
  for (const stage of stages) {
    if (stage.budgetGpuHours !== null && stage.gpuHours > stage.budgetGpuHours + 1e-9) {
      findings.push(
        make(
          'plan.stage-over-budget',
          stage.id,
          `Stage ${stage.id} cells cost ${hours(stage.gpuHours)} GPU-h, over its ${hours(stage.budgetGpuHours)} budget.`,
          ['/stages']
        )
      )
    }
  }
  const gateless = stages.filter((stage) => !stage.gate)
  const points = list(plan.decisionPoints)
  const branchless = points.filter(
    (point) => !hasText(point.if) || !hasText(point.then) || !hasText(point.else)
  )
  if (gateless.length || !points.length || branchless.length) {
    findings.push(
      make(
        'plan.gate-missing',
        gateless[0]?.id ?? 'decisionPoints',
        sentence([
          gateless.length &&
            `stages without a gate: ${gateless.map((stage) => stage.id).join(', ')}`,
          !points.length && 'no decision points',
          branchless.length &&
            `${branchless.length} decision point${branchless.length === 1 ? '' : 's'} without if, then and else`
        ]),
        ['/stages', '/decisionPoints']
      )
    )
  }
  if (!textList(plan.stoppingRules).length) {
    findings.push(
      make(
        'plan.no-stopping-rule',
        'stoppingRules',
        "No stopping rules (a stage's budget spent, three failed Runs of one cell, a gate failing twice).",
        ['/stoppingRules']
      )
    )
  }
  return findings
}

function executabilityChecks(plan, make) {
  const findings = []
  const statistics = plan.statistics ?? {}
  const comparisons = comparisonCount(plan)
  const tests = Array.isArray(statistics.test)
    ? textList(statistics.test)
    : hasText(statistics.test)
      ? [statistics.test]
      : []
  const procedures =
    tests.filter((test) => test !== 'none').length +
    (hasText(statistics.equivalenceTest) ? 1 : 0) +
    (hasText(statistics.multipleComparisons) && statistics.multipleComparisons !== 'none' ? 1 : 0)
  const crowded = runOrder(plan).stages.filter((stage) => stage.cells.length > MAX_CELLS_PER_STAGE)
  const cells = list(plan.matrix).length
  const reasons = [
    procedures > 1 &&
      comparisons <= MAX_COMPARISONS_WITHOUT_CORRECTION &&
      `${procedures} statistical procedures for ${comparisons} comparisons; a paired CI of the difference plus a minimum effect decides the same`,
    crowded.length &&
      `${crowded.map((stage) => `${stage.id} has ${stage.cells.length} cells`).join(', ')} (one agent tracks about ${MAX_CELLS_PER_STAGE})`,
    cells > MAX_CELLS && `${cells} cells in all`
  ].filter(Boolean)
  if (reasons.length) {
    findings.push(
      make(
        'plan.over-engineered',
        'plan',
        `Hard to execute: ${reasons.join('; ')}. Keep the simplest design that answers each question.`,
        ['/statistics', '/matrix']
      )
    )
  }
  const datasets = new Map(list(plan.datasets).map((dataset) => [dataset.id, dataset]))
  const used = new Set(
    list(plan.matrix)
      .filter((cell) => MAIN_USES.includes(cell.purpose))
      .map((cell) => cell.factors?.dataset)
      .filter(Boolean)
  )
  for (const dataset of datasets.values()) {
    const swapped = hasText(dataset.replaces) || dataset.standard === false
    const inMain = used.has(dataset.id) || used.has(dataset.name) || dataset.role === 'main'
    if (swapped && inMain && dataset.consent !== 'user') {
      findings.push(
        make(
          'plan.benchmark-drift',
          dataset.id,
          `${dataset.name ?? dataset.id} ${hasText(dataset.replaces) ? `replaces the standard ${dataset.replaces}` : "is not the field's standard setting"} in the main results without the person's consent. Cheaper settings belong in pilots; ask before changing the main table.`,
          [`/datasets/${list(plan.datasets).indexOf(dataset)}`]
        )
      )
    }
  }
  return findings
}

export function budgetChecks(plan, make) {
  return [
    ...costChecks(plan, make),
    ...fitChecks(plan, make),
    ...paddingChecks(plan, make),
    ...orderChecks(plan, make),
    ...executabilityChecks(plan, make),
    ...teamChecks(plan, make)
  ]
}

/** Checklist G: every common reviewer category heard, every request answered, demands not dropped. */
export function reviewChecks(plan, make) {
  const findings = []
  const requests = premortemRequests(plan)
  if (!requests.length) {
    findings.push(
      make(
        'plan.premortem-missing',
        'premortem',
        'No reviewer pre-mortem: run the simulated reviewers (plan premortem brief) before showing the plan, and record their requests.',
        ['/premortem']
      )
    )
    return findings
  }
  const heard = new Set(requests.map((request) => request.category))
  const waived = new Set(
    list(plan.premortem?.notApplicable)
      .filter((entry) => hasText(entry.reason))
      .map((entry) => entry.category)
  )
  const silent = COMMON_CATEGORY_IDS.filter((id) => !heard.has(id) && !waived.has(id))
  const unknown = requests.filter((request) => !REVIEW_CATEGORY_IDS.includes(request.category))
  const open = requests.filter((request) => !request.resolution?.as)
  const reasonless = requests.filter(
    (request) =>
      ['out-of-scope', 'ask'].includes(request.resolution?.as) &&
      !hasText(request.resolution.reason)
  )
  const itemless = requests.filter(
    (request) => request.resolution?.as === 'plan' && !textList(request.resolution.items).length
  )
  const parts = [
    silent.length &&
      `no simulated request in ${silent.map((id) => `${reviewCategory(id).label.toLowerCase()} (${reviewCategory(id).rate}%)`).join(', ')}`,
    unknown.length &&
      `${unknown.length} request${unknown.length === 1 ? ' has' : 's have'} no known category`,
    open.length &&
      `${open.length} request${open.length === 1 ? ' is' : 's are'} not resolved: ${open
        .map((request) => request.id)
        .slice(0, 8)
        .join(', ')}`,
    reasonless.length &&
      `out-of-scope or ask without a reason: ${reasonless
        .map((request) => request.id)
        .slice(0, 8)
        .join(', ')}`,
    itemless.length &&
      `resolved into the plan without naming the items: ${itemless
        .map((request) => request.id)
        .slice(0, 8)
        .join(', ')}`
  ].filter(Boolean)
  if (parts.length) {
    findings.push(make('plan.review-uncovered', 'premortem', sentence(parts), ['/premortem']))
  }
  const dropped = requests.filter(
    (request) =>
      isLikelyDemand(request) &&
      request.resolution?.as === 'out-of-scope' &&
      request.resolution.by !== 'user'
  )
  if (dropped.length) {
    findings.push(
      make(
        'plan.demand-dropped',
        dropped[0].id,
        `Likely reviewer demands set out of scope by the agent: ${dropped
          .map((request) => `${request.id} (${request.request})`)
          .slice(0, 4)
          .join('; ')}. Keep them, or resolve them as ask with their cost so the person decides.`,
        ['/premortem/requests']
      )
    )
  }
  return findings
}
