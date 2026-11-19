// The experiment plan (`aster.plan/v1`): one study design above the Experiments of a project.
// Agents write its content with `plan new|set`; the harness owns its id, revision and status, and
// only the user approves it (from Aster). Field names follow research/plan-format.md in camelCase.

import { HarnessError } from './research-harness-error.mjs'

export const PLAN_SCHEMA = 'aster.plan/v1'
export const PLAN_STATUSES = ['draft', 'submitted', 'approved', 'closed']
export const TIERS = ['must', 'should', 'could']
export const CLAIM_KINDS = [
  'performance',
  'generality',
  'mechanism',
  'efficiency',
  'robustness',
  'analysis'
]
export const CLAIM_STATUSES = ['planned', 'argued-only', 'supported', 'weakened', 'refuted']
/** Claim statuses that only the user sets, after results. */
export const USER_CLAIM_STATUSES = ['supported', 'weakened', 'refuted']
export const BASELINE_ROLES = [
  'strongest-recent',
  'closest-prior',
  'simplest',
  'no-training-floor',
  'ablated-self',
  'input-ablated',
  'oracle',
  'standard-recipe'
]
export const BASELINE_SOURCES = ['rerun-official-code', 'reimplemented', 'copied']
export const DATASET_ROLES = ['main', 'heldout', 'ood', 'stress', 'sanity']
export const CELL_PURPOSES = [
  'sanity',
  'pilot',
  'main',
  'ablation',
  'sensitivity',
  'tuning',
  'cost',
  'analysis',
  'heldout',
  'generality',
  'judge-validation'
]
export const COST_SOURCES = ['prior-run', 'paper', 'measured', 'timing-cell', 'estimate']
export const ABLATION_STRUCTURES = [
  'remove',
  'swap',
  'sweep',
  'stepwise',
  'factorial',
  'add-on-top'
]
export const ANALYSIS_KINDS = [
  'failure-cases',
  'slices',
  'mechanism-probe',
  'qualitative',
  'sensitivity',
  'contingent'
]
export const BUDGET_SOURCES = ['user', 'compute-policy', 'assumed', 'unknown']
export const LIKELIHOODS = ['high', 'medium', 'low']
export const RESOLUTIONS = ['plan', 'out-of-scope', 'ask']

/** Top-level content keys an agent may write; anything else is refused as a likely typo. */
export const CONTENT_KEYS = [
  'title',
  'method',
  'scope',
  'claims',
  'questions',
  'methodComponents',
  'baselines',
  'notCompared',
  'baselineSearch',
  'datasets',
  'metrics',
  'statistics',
  'hyperparameters',
  'protocol',
  'matrix',
  'ablations',
  'costMeasurements',
  'costBasis',
  'analysis',
  'leakageChecks',
  'leakageReason',
  'humanEval',
  'stages',
  'decisionPoints',
  'stoppingRules',
  'risks',
  'premortem'
]
/** Keys only the harness writes. */
export const MANAGED_KEYS = [
  'schema',
  'id',
  'revision',
  'status',
  'createdAt',
  'updatedAt',
  'updatedBy',
  'agent',
  'approval'
]

const ITEM_ID = /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,79}$/u
const MAX_ISSUES = 25

export function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function list(value) {
  return Array.isArray(value) ? value.filter(isObject) : []
}

export function textList(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.trim()) : []
}

export function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0
}

export function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** A cell's planned GPU-hours: `cost.total`, else each × seeds; null when it has no cost. */
export function cellCost(cell) {
  const total = finiteNumber(cell?.cost?.total)
  if (total !== null) {
    return total
  }
  const each = finiteNumber(cell?.cost?.gpuHoursEach)
  if (each === null) {
    return null
  }
  const seeds = Number.isInteger(cell.seeds) && cell.seeds > 0 ? cell.seeds : 1
  return each * seeds
}

export function cellTier(cell) {
  return TIERS.includes(cell?.tier) ? cell.tier : 'must'
}

/** Claim → question links in either direction (`claim.evidence` or `question.claim`). */
export function claimQuestions(plan, claim) {
  const evidence = new Set(textList(claim.evidence))
  return list(plan.questions).filter(
    (question) => question.claim === claim.id || evidence.has(question.id)
  )
}

class Issues {
  constructor() {
    this.items = []
  }
  add(path, message) {
    this.items.push(`${path}: ${message}`)
  }
}

function checkEnum(issues, path, value, choices, { required = false } = {}) {
  if (value === undefined || value === null) {
    if (required) {
      issues.add(path, `is required (${choices.join(' | ')})`)
    }
    return
  }
  if (!choices.includes(value)) {
    issues.add(path, `must be one of ${choices.join(' | ')}, got ${JSON.stringify(value)}`)
  }
}

function checkNumber(issues, path, value) {
  if (
    value !== undefined &&
    value !== null &&
    !(typeof value === 'number' && value >= 0 && Number.isFinite(value))
  ) {
    issues.add(path, 'must be a non-negative number or null')
  }
}

function checkArray(issues, path, value) {
  if (value === undefined || value === null) {
    return []
  }
  if (!Array.isArray(value)) {
    issues.add(path, 'must be an array')
    return []
  }
  return value
}

/** IDs of an array of objects; refuses missing, malformed and duplicate IDs. */
function checkIds(issues, key, items, idKey = 'id') {
  const ids = new Set()
  items.forEach((item, index) => {
    if (!isObject(item)) {
      issues.add(`${key}[${index}]`, 'must be an object')
      return
    }
    const id = item[idKey]
    if (typeof id !== 'string' || !ITEM_ID.test(id)) {
      issues.add(`${key}[${index}].${idKey}`, 'needs an ID of letters, digits and . _ : + -')
    } else if (ids.has(id)) {
      issues.add(`${key}[${index}].${idKey}`, `duplicate ID ${id}`)
    } else {
      ids.add(id)
    }
  })
  return ids
}

function checkRefs(issues, path, value, known, label) {
  const refs = value === undefined || value === null ? [] : Array.isArray(value) ? value : [value]
  for (const ref of refs) {
    if (typeof ref !== 'string' || !known.has(ref)) {
      issues.add(path, `refers to unknown ${label} ${JSON.stringify(ref)}`)
    }
  }
}

function checkPremortem(issues, premortem, known) {
  if (premortem === undefined || premortem === null) {
    return
  }
  if (!isObject(premortem)) {
    issues.add('premortem', 'must be an object')
    return
  }
  const requests = checkArray(issues, 'premortem.requests', premortem.requests)
  checkIds(issues, 'premortem.requests', requests)
  requests.forEach((request, index) => {
    if (!isObject(request)) {
      return
    }
    const path = `premortem.requests[${index}]`
    if (!hasText(request.request)) {
      issues.add(`${path}.request`, 'is required')
    }
    checkEnum(issues, `${path}.likelihood`, request.likelihood, LIKELIHOODS)
    const resolution = request.resolution
    if (resolution === undefined || resolution === null) {
      return
    }
    if (!isObject(resolution)) {
      issues.add(`${path}.resolution`, 'must be an object')
      return
    }
    checkEnum(issues, `${path}.resolution.as`, resolution.as, RESOLUTIONS, { required: true })
    checkRefs(issues, `${path}.resolution.items`, resolution.items ?? [], known, 'plan item')
    checkNumber(issues, `${path}.resolution.costGpuHours`, resolution.costGpuHours)
  })
}

function checkScope(issues, scope) {
  if (scope === undefined) {
    return
  }
  if (!isObject(scope)) {
    issues.add('scope', 'must be an object')
    return
  }
  if (scope.compute !== undefined && scope.compute !== null) {
    for (const key of ['gpuHours', 'gpus', 'days']) {
      checkNumber(issues, `scope.compute.${key}`, scope.compute[key])
    }
    checkEnum(issues, 'scope.compute.source', scope.compute.source, BUDGET_SOURCES)
    const reserve = scope.compute.reserve
    if (
      reserve !== undefined &&
      reserve !== null &&
      !(finiteNumber(reserve) >= 0 && reserve <= 0.5)
    ) {
      issues.add('scope.compute.reserve', 'must be a fraction from 0 to 0.5 (0.2 = keep 20% spare)')
    }
  }
  if (scope.team !== undefined && scope.team !== null) {
    checkNumber(issues, 'scope.team.people', scope.team.people)
    checkNumber(issues, 'scope.team.weeks', scope.team.weeks)
  }
}

/** `baselineSearch.closest`: the closest prior methods, each a paper with an arXiv id or DOI. */
function checkBaselineSearch(issues, search, baselineIds, claimIds) {
  if (search === undefined || search === null) {
    return
  }
  if (!isObject(search)) {
    issues.add('baselineSearch', 'must be an object')
    return
  }
  const closest = checkArray(issues, 'baselineSearch.closest', search.closest)
  closest.forEach((entry, index) => {
    const path = `baselineSearch.closest[${index}]`
    if (!isObject(entry)) {
      issues.add(path, 'must be an object')
      return
    }
    if (!hasText(entry.title)) {
      issues.add(`${path}.title`, "is required (the paper's title)")
    }
    if (hasText(entry.baseline)) {
      checkRefs(issues, `${path}.baseline`, entry.baseline, baselineIds, 'baseline')
    }
    if (hasText(entry.claim)) {
      checkRefs(issues, `${path}.claim`, entry.claim, claimIds, 'claim')
    }
  })
}

/**
 * Structural problems in plan content, as `path: message` lines (empty when valid). Judgment is
 * left to `plan check`; this only refuses what would make the plan unreadable or ambiguous.
 */
export function planContentIssues(content) {
  const issues = new Issues()
  if (!isObject(content)) {
    return ['plan: must be a JSON object']
  }
  for (const key of Object.keys(content)) {
    if (!CONTENT_KEYS.includes(key) && !MANAGED_KEYS.includes(key)) {
      issues.add(key, `is not a plan field (fields: ${CONTENT_KEYS.join(', ')})`)
    }
  }
  const claims = checkArray(issues, 'claims', content.claims)
  const questions = checkArray(issues, 'questions', content.questions)
  const components = checkArray(issues, 'methodComponents', content.methodComponents)
  const baselines = checkArray(issues, 'baselines', content.baselines)
  const datasets = checkArray(issues, 'datasets', content.datasets)
  const matrix = checkArray(issues, 'matrix', content.matrix)
  const ablations = checkArray(issues, 'ablations', content.ablations)
  const analysis = checkArray(issues, 'analysis', content.analysis)
  const stages = checkArray(issues, 'stages', content.stages)
  for (const key of [
    'notCompared',
    'metrics',
    'costMeasurements',
    'costBasis',
    'leakageChecks',
    'decisionPoints',
    'stoppingRules',
    'risks'
  ]) {
    checkArray(issues, key, content[key])
  }
  const claimIds = checkIds(issues, 'claims', claims)
  const questionIds = checkIds(issues, 'questions', questions)
  const componentIds = checkIds(issues, 'methodComponents', components)
  const baselineIds = checkIds(issues, 'baselines', baselines)
  const datasetIds = checkIds(issues, 'datasets', datasets)
  const cellIds = checkIds(issues, 'matrix', matrix, 'cell')
  const ablationIds = checkIds(issues, 'ablations', ablations)
  const analysisIds = checkIds(issues, 'analysis', analysis)
  const stageIds = checkIds(issues, 'stages', stages)
  claims.filter(isObject).forEach((claim, index) => {
    checkEnum(issues, `claims[${index}].kind`, claim.kind, CLAIM_KINDS)
    checkEnum(issues, `claims[${index}].weight`, claim.weight, ['main', 'secondary'])
    checkEnum(issues, `claims[${index}].status`, claim.status, CLAIM_STATUSES)
    checkRefs(issues, `claims[${index}].evidence`, claim.evidence ?? [], questionIds, 'question')
  })
  questions.filter(isObject).forEach((question, index) => {
    if (question.claim !== undefined && question.claim !== null) {
      checkRefs(issues, `questions[${index}].claim`, question.claim, claimIds, 'claim')
    }
  })
  components.filter(isObject).forEach((component, index) => {
    if (hasText(component.ablation) && component.ablation !== 'none') {
      checkRefs(
        issues,
        `methodComponents[${index}].ablation`,
        component.ablation,
        ablationIds,
        'ablation'
      )
    }
  })
  baselines.filter(isObject).forEach((baseline, index) => {
    checkEnum(issues, `baselines[${index}].role`, baseline.role, BASELINE_ROLES)
    checkEnum(issues, `baselines[${index}].source`, baseline.source, BASELINE_SOURCES)
    if (hasText(baseline.reproduce?.cell)) {
      checkRefs(
        issues,
        `baselines[${index}].reproduce.cell`,
        baseline.reproduce.cell,
        cellIds,
        'cell'
      )
    }
  })
  datasets.filter(isObject).forEach((dataset, index) => {
    checkEnum(issues, `datasets[${index}].role`, dataset.role, DATASET_ROLES)
  })
  matrix.filter(isObject).forEach((cell, index) => {
    const path = `matrix[${index}]`
    checkEnum(issues, `${path}.purpose`, cell.purpose, CELL_PURPOSES, { required: true })
    checkEnum(issues, `${path}.tier`, cell.tier, TIERS)
    if (cell.stage !== undefined && cell.stage !== null) {
      checkRefs(issues, `${path}.stage`, cell.stage, stageIds, 'stage')
    }
    if (cell.question !== undefined && cell.question !== null) {
      checkRefs(issues, `${path}.question`, cell.question, questionIds, 'question')
    }
    checkRefs(issues, `${path}.compareTo`, cell.compareTo ?? [], cellIds, 'cell')
    if (cell.seeds !== undefined && !(Number.isInteger(cell.seeds) && cell.seeds >= 1)) {
      issues.add(`${path}.seeds`, 'must be a positive integer')
    }
    if (cell.cost !== undefined && cell.cost !== null) {
      if (!isObject(cell.cost)) {
        issues.add(`${path}.cost`, 'must be an object')
      } else {
        checkNumber(issues, `${path}.cost.gpuHoursEach`, cell.cost.gpuHoursEach)
        checkNumber(issues, `${path}.cost.total`, cell.cost.total)
        checkEnum(issues, `${path}.cost.source`, cell.cost.source, COST_SOURCES)
      }
    }
  })
  ablations.filter(isObject).forEach((ablation, index) => {
    checkEnum(issues, `ablations[${index}].structure`, ablation.structure, ABLATION_STRUCTURES)
    if (ablation.component !== undefined && ablation.component !== null) {
      checkRefs(
        issues,
        `ablations[${index}].component`,
        ablation.component,
        componentIds,
        'component'
      )
    }
    checkRefs(issues, `ablations[${index}].cells`, ablation.cells ?? [], cellIds, 'cell')
  })
  analysis.filter(isObject).forEach((entry, index) => {
    checkEnum(issues, `analysis[${index}].kind`, entry.kind, ANALYSIS_KINDS)
  })
  checkScope(issues, content.scope)
  checkBaselineSearch(issues, content.baselineSearch, baselineIds, claimIds)
  const known = new Set([
    ...claimIds,
    ...questionIds,
    ...componentIds,
    ...baselineIds,
    ...datasetIds,
    ...cellIds,
    ...ablationIds,
    ...analysisIds,
    ...stageIds,
    ...list(content.costMeasurements)
      .map((entry) => entry.id)
      .filter(hasText)
  ])
  checkPremortem(issues, content.premortem, known)
  return issues.items.slice(0, MAX_ISSUES)
}

export function assertValidPlanContent(content) {
  const issues = planContentIssues(content)
  if (issues.length) {
    throw new HarnessError(
      'invalid_plan',
      `The plan has ${issues.length === MAX_ISSUES ? 'at least ' : ''}${issues.length} problem${issues.length === 1 ? '' : 's'}:\n- ${issues.join('\n- ')}`
    )
  }
}

/** Every item ID in the plan, for premortem resolutions and cut lists. */
export function planItemIds(plan) {
  return new Set(
    [
      ...list(plan.claims).map((item) => item.id),
      ...list(plan.questions).map((item) => item.id),
      ...list(plan.methodComponents).map((item) => item.id),
      ...list(plan.baselines).map((item) => item.id),
      ...list(plan.datasets).map((item) => item.id),
      ...list(plan.matrix).map((item) => item.cell),
      ...list(plan.ablations).map((item) => item.id),
      ...list(plan.analysis).map((item) => item.id),
      ...list(plan.stages).map((item) => item.id),
      ...list(plan.costMeasurements).map((item) => item.id)
    ].filter(hasText)
  )
}
