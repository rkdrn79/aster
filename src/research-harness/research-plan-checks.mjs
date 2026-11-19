// `plan check`: the testable items of research/checklist.md on one plan.json, reported as rule
// findings in the same shape as `check` (severity fail = the checklist's "block").

import { realpath } from 'node:fs/promises'
import { budgetChecks, reviewChecks } from './research-plan-checks-budget.mjs'
import { evaluationChecks } from './research-plan-checks-evaluation.mjs'
import { readPlanFile, resolvePlanId } from './research-plan.mjs'
import { claimQuestions, hasText, list, textList } from './research-plan-schema.mjs'

/** Check IDs and severities: fail blocks submitting the plan; warn needs a reason; info is shown. */
export const PLAN_CHECKS = {
  'plan.claim-unmapped': 'fail',
  'plan.hypothesis-unfalsifiable': 'fail',
  'plan.min-effect-missing': 'fail',
  'plan.question-orphan': 'warn',
  'plan.baseline-roles': 'fail',
  'plan.baseline-unjustified': 'warn',
  'plan.baseline-search-missing': 'warn',
  'plan.closest-prior-missing': 'fail',
  'plan.closest-prior-few': 'warn',
  'plan.closest-prior-unresolved': 'fail',
  'plan.closest-prior-unidentified': 'warn',
  'plan.tuning-asymmetric': 'fail',
  'plan.tuning-saturation': 'info',
  'plan.tuning-uncosted': 'warn',
  'plan.budget-asymmetric': 'warn',
  'plan.copied-supports-claim': 'warn',
  'plan.baseline-not-reproduced': 'warn',
  'plan.component-unablated': 'fail',
  'plan.ablation-no-default': 'warn',
  'plan.mechanism-unprobed': 'warn',
  'plan.hparam-sensitivity': 'warn',
  'plan.seeds-too-few': 'fail',
  'plan.variance-unspecified': 'fail',
  'plan.difference-rule-missing': 'warn',
  'plan.multiplicity': 'info',
  'plan.selection-on-test': 'fail',
  'plan.protocol-per-arm': 'fail',
  'plan.leakage-unchecked': 'warn',
  'plan.metric-unjustified': 'warn',
  'plan.judge-unvalidated': 'fail',
  'plan.heldout-missing': 'warn',
  'plan.generality-single-regime': 'warn',
  'plan.out-of-scope-empty': 'warn',
  'plan.cost-unmeasured': 'warn',
  'plan.analysis-missing': 'warn',
  'plan.contingent-analysis-missing': 'warn',
  'plan.cost-missing': 'fail',
  'plan.cost-unsourced': 'warn',
  'plan.cost-basis-missing': 'warn',
  'plan.budget-assumed': 'fail',
  'plan.budget-unknown': 'warn',
  'plan.over-budget': 'fail',
  'plan.cuts-needed': 'warn',
  'plan.no-reserve': 'warn',
  'plan.optional-padding': 'warn',
  'plan.no-decision': 'warn',
  'plan.stage-over-budget': 'warn',
  'plan.no-sanity-stage': 'fail',
  'plan.order-not-cheap-first': 'warn',
  'plan.no-cheap-falsifier': 'warn',
  'plan.gate-missing': 'fail',
  'plan.no-stopping-rule': 'warn',
  'plan.over-engineered': 'warn',
  'plan.team-overload': 'warn',
  'plan.benchmark-drift': 'warn',
  'plan.premortem-missing': 'fail',
  'plan.review-uncovered': 'warn',
  'plan.demand-dropped': 'warn',
  'plan.untiered': 'info'
}
const SEVERITY_ORDER = { fail: 0, warn: 1, info: 2 }
const MAX_TEXT = 2000
const STRONG_ROLES = ['strongest-recent', 'standard-recipe']
const MIN_CLOSEST = 3
const SIMPLE_ROLES = ['simplest', 'no-training-floor']
/** Cells that need not serve a question: they check the pipeline, cost or the judge. */
export const SUPPORT_PURPOSES = ['sanity', 'cost', 'tuning', 'judge-validation']

function pointer(plan, key, id, idKey = 'id') {
  const index = list(plan[key]).findIndex((item) => item[idKey] === id)
  return index === -1 ? `/${key}` : `/${key}/${index}`
}

/** Builds findings for one plan; `target` names the item (claim, cell, baseline…) or the plan. */
export function findingFactory(plan) {
  const revision = Number.isInteger(plan.revision) ? plan.revision : 1
  const id = plan.id ?? 'plan'
  const make = (check, target, text, paths = []) => ({
    id: `rule:${check}:${id}/${target}`,
    source: 'rule',
    check,
    layer: 'design',
    severity: PLAN_CHECKS[check],
    status: 'open',
    plan: id,
    revision,
    target,
    text: text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1)}…` : text,
    evidence: (paths.length ? paths : ['']).map((path) => ({
      kind: 'plan',
      plan: id,
      revision,
      path
    }))
  })
  make.pointer = (key, itemId, idKey) => pointer(plan, key, itemId, idKey)
  return make
}

function claimChecks(plan, make) {
  const findings = []
  const cells = list(plan.matrix)
  for (const claim of list(plan.claims)) {
    if (claim.weight === 'secondary' || claim.status === 'argued-only') {
      continue
    }
    const questions = claimQuestions(plan, claim)
    const ids = new Set(questions.map((question) => question.id))
    const own = cells.filter((cell) => ids.has(cell.question))
    if (!questions.length || !own.length) {
      findings.push(
        make(
          'plan.claim-unmapped',
          claim.id,
          `Main claim ${claim.id} ("${claim.text ?? ''}") has no ${questions.length ? `cell under ${[...ids].join(', ')}` : 'question'}: plan an experiment for it or mark it argued-only.`,
          [make.pointer('claims', claim.id)]
        )
      )
    }
  }
  if (!list(plan.claims).length) {
    findings.push(
      make(
        'plan.claim-unmapped',
        'claims',
        'The plan lists no claims: write the claims the paper will make, each main or secondary.',
        ['/claims']
      )
    )
  }
  for (const question of list(plan.questions)) {
    const missing = ['hypothesis', 'predictionIfFalse'].filter((key) => !hasText(question[key]))
    if (missing.length) {
      findings.push(
        make(
          'plan.hypothesis-unfalsifiable',
          question.id,
          `Question ${question.id} has no ${missing.join(' and no ')}: say what you expect and the result that would count against it.`,
          [make.pointer('questions', question.id)]
        )
      )
    }
    if (!hasText(question.minEffect) && !hasText(plan.statistics?.minEffect)) {
      findings.push(
        make(
          'plan.min-effect-missing',
          question.id,
          `Question ${question.id} has no minimum effect: the smallest difference that would matter, in metric units or seed spread (or one plan-wide statistics.minEffect).`,
          [make.pointer('questions', question.id)]
        )
      )
    }
    if (!cells.some((cell) => cell.question === question.id)) {
      findings.push(
        make(
          'plan.question-orphan',
          question.id,
          `Question ${question.id} has no cell in the matrix.`,
          [make.pointer('questions', question.id)]
        )
      )
    }
  }
  const orphans = cells.filter(
    (cell) => !SUPPORT_PURPOSES.includes(cell.purpose) && !hasText(cell.question)
  )
  if (orphans.length) {
    findings.push(
      make(
        'plan.question-orphan',
        'matrix',
        `${orphans.length} ${orphans[0].purpose} cell${orphans.length === 1 ? '' : 's'} serve no question: ${orphans
          .map((cell) => cell.cell)
          .slice(0, 8)
          .join(', ')}.`,
        orphans.slice(0, 8).map((cell) => make.pointer('matrix', cell.cell, 'cell'))
      )
    )
  }
  return findings
}

function rerun(baseline) {
  return baseline.source !== 'copied'
}

function baselineChecks(plan, make) {
  const findings = []
  const baselines = list(plan.baselines)
  const roles = new Set(baselines.map((baseline) => baseline.role))
  const missingRoles = [
    !STRONG_ROLES.some((role) => roles.has(role)) &&
      'a strongest-recent (or re-tuned standard-recipe) baseline',
    !SIMPLE_ROLES.some((role) => roles.has(role)) && 'a simplest or no-training-floor baseline'
  ].filter(Boolean)
  if (missingRoles.length) {
    findings.push(
      make(
        'plan.baseline-roles',
        'baselines',
        `The baselines have no ${missingRoles.join(' and no ')}.`,
        ['/baselines']
      )
    )
  }
  for (const baseline of baselines.filter((entry) => !hasText(entry.why))) {
    findings.push(
      make(
        'plan.baseline-unjustified',
        baseline.id,
        `Baseline ${baseline.id} (${baseline.name ?? ''}) has no reason (why).`,
        [make.pointer('baselines', baseline.id)]
      )
    )
  }
  list(plan.notCompared).forEach((entry, index) => {
    if (!hasText(entry.reason)) {
      findings.push(
        make(
          'plan.baseline-unjustified',
          `not-compared-${index + 1}`,
          `${entry.name ?? 'A method'} is not compared and has no reason.`,
          [`/notCompared/${index}`]
        )
      )
    }
  })
  if (!textList(plan.baselineSearch?.sources).length) {
    findings.push(
      make(
        'plan.baseline-search-missing',
        'baselineSearch',
        'The plan does not record where baselines were searched (the project Library, related work, papers citing the closest prior method, leaderboards). Reviewers most often name a prior method the plan never considered.',
        ['/baselineSearch']
      )
    )
  }
  findings.push(...closestPriorChecks(plan, make))
  const hp = plan.hyperparameters ?? {}
  const methodTrials = Number.isInteger(hp.methodTrials) ? hp.methodTrials : null
  const tuned = baselines.filter(rerun)
  const unequal = tuned.filter((baseline) => {
    const trials = baseline.fairness?.tuning?.trials
    return (
      !hasText(baseline.fairness?.tuning?.asymmetryReason) &&
      (methodTrials === null || trials !== methodTrials)
    )
  })
  if (tuned.length && (methodTrials === null || unequal.length)) {
    findings.push(
      make(
        'plan.tuning-asymmetric',
        'hyperparameters',
        methodTrials === null
          ? "The method's tuning trials (hyperparameters.methodTrials) are not stated, so equal tuning cannot be checked."
          : `Baselines tuned with a different number of trials than the method (${methodTrials}) and no stated reason: ${unequal.map((baseline) => `${baseline.id} ${baseline.fairness?.tuning?.trials ?? 'unstated'}`).join(', ')}.`,
        [
          '/hyperparameters',
          ...unequal
            .slice(0, 6)
            .map((baseline) => `${make.pointer('baselines', baseline.id)}/fairness/tuning`)
        ]
      )
    )
  }
  if (tuned.length && !hasText(hp.saturationCheck)) {
    findings.push(
      make(
        'plan.tuning-saturation',
        'hyperparameters',
        'No check that the shared tuning budget is enough (one cheap cell with 3–10× the trials for the strongest baseline).',
        ['/hyperparameters']
      )
    )
  }
  const maxTrials = Math.max(
    methodTrials ?? 0,
    ...tuned.map((baseline) => baseline.fairness?.tuning?.trials ?? 0)
  )
  if (
    maxTrials > 1 &&
    hp.tuningCostIncluded !== true &&
    !list(plan.matrix).some((cell) => cell.purpose === 'tuning')
  ) {
    findings.push(
      make(
        'plan.tuning-uncosted',
        'hyperparameters',
        `Up to ${maxTrials} tuning trials per arm are promised, but no tuning cell carries their cost (set hyperparameters.tuningCostIncluded when cell costs already include them).`,
        ['/hyperparameters']
      )
    )
  }
  for (const baseline of tuned) {
    const fairness = baseline.fairness ?? {}
    const gaps = [
      fairness.sameData === false && !hasText(fairness.notes) && 'different data',
      fairness.sameBackbone === false && !hasText(fairness.notes) && 'a different backbone',
      !hasText(fairness.trainingBudget) && 'no stated training budget'
    ].filter(Boolean)
    if (gaps.length) {
      findings.push(
        make(
          'plan.budget-asymmetric',
          baseline.id,
          `Baseline ${baseline.id} has ${gaps.join(', ')}.`,
          [`${make.pointer('baselines', baseline.id)}/fairness`]
        )
      )
    }
  }
  const copied = baselines.filter((baseline) => baseline.source === 'copied')
  for (const baseline of copied.filter((entry) => !hasText(entry.copiedFrom))) {
    findings.push(
      make(
        'plan.copied-supports-claim',
        baseline.id,
        `Baseline ${baseline.id} is copied but does not say from where (copiedFrom).`,
        [make.pointer('baselines', baseline.id)]
      )
    )
  }
  const strong = baselines.filter(
    (baseline) => STRONG_ROLES.includes(baseline.role) || baseline.role === 'closest-prior'
  )
  if (strong.length && strong.every((baseline) => baseline.source === 'copied')) {
    findings.push(
      make(
        'plan.copied-supports-claim',
        'baselines',
        'Every strong baseline is copied from papers: copied numbers alone cannot support an improvement claim. Re-run at least one.',
        ['/baselines']
      )
    )
  }
  const cells = new Set(list(plan.matrix).map((cell) => cell.cell))
  for (const baseline of tuned.filter((entry) => strong.includes(entry))) {
    const reproduce = baseline.reproduce ?? {}
    if (!cells.has(reproduce.cell) || !hasText(reproduce.tolerance)) {
      findings.push(
        make(
          'plan.baseline-not-reproduced',
          baseline.id,
          `Baseline ${baseline.id} (${baseline.name ?? ''}) is re-run with no ${cells.has(reproduce.cell) ? 'tolerance' : 'reproduction cell'} against its published number; add an S0 cell and a tolerance.`,
          [make.pointer('baselines', baseline.id)]
        )
      )
    }
  }
  const reproduced = tuned.some((baseline) => cells.has(baseline.reproduce?.cell))
  if (
    tuned.length &&
    !reproduced &&
    !findings.some((f) => f.check === 'plan.baseline-not-reproduced')
  ) {
    findings.push(
      make(
        'plan.baseline-not-reproduced',
        'baselines',
        `None of the ${tuned.length} re-run baselines is reproduced against its published number; add an S0 cell with a tolerance for the strongest one.`,
        ['/baselines']
      )
    )
  }
  return findings
}

/**
 * Reviewers most often ask for the closest prior methods. They are searched for before planning,
 * recorded as papers (arXiv id or DOI and title, for the Library), and each one is a baseline or
 * has a reason.
 */
function closestPriorChecks(plan, make) {
  const closest = list(plan.baselineSearch?.closest)
  if (!closest.length) {
    return [
      make(
        'plan.closest-prior-missing',
        'baselineSearch',
        'No closest prior methods recorded. Before planning, search for the 3–5 published methods closest to this one (`papers search "<what the method does>"`, the project Library, the related work) and list each in baselineSearch.closest with its title and arXiv id or DOI; each becomes a baseline or gets a reason.',
        ['/baselineSearch/closest']
      )
    ]
  }
  const findings = []
  if (closest.length < MIN_CLOSEST) {
    findings.push(
      make(
        'plan.closest-prior-few',
        'baselineSearch',
        `Only ${closest.length} closest prior method${closest.length === 1 ? '' : 's'} recorded; search for ${MIN_CLOSEST}–5 (methods for the same problem, the same mechanism, or the one this method extends).`,
        ['/baselineSearch/closest']
      )
    )
  }
  const baselines = new Set(list(plan.baselines).map((baseline) => baseline.id))
  const unresolved = closest.filter(
    (entry) => !baselines.has(entry.baseline) && !hasText(entry.reason)
  )
  if (unresolved.length) {
    findings.push(
      make(
        'plan.closest-prior-unresolved',
        'baselineSearch',
        `Closest prior methods with no baseline and no reason: ${unresolved
          .map((entry) => entry.method ?? entry.title)
          .slice(0, 5)
          .join(
            '; '
          )}. Compare against each (a baseline with role closest-prior, its ID in "baseline") or write why not in "reason".`,
        ['/baselineSearch/closest']
      )
    )
  }
  const anonymous = closest.filter((entry) => !hasText(entry.arxiv) && !hasText(entry.doi))
  if (anonymous.length) {
    findings.push(
      make(
        'plan.closest-prior-unidentified',
        'baselineSearch',
        `${anonymous.length} closest prior method${anonymous.length === 1 ? ' has' : 's have'} no arXiv id or DOI, so they cannot go into the Library: ${anonymous
          .map((entry) => entry.title)
          .slice(0, 4)
          .join('; ')}.`,
        ['/baselineSearch/closest']
      )
    )
  }
  return findings
}

function ablationChecks(plan, make) {
  const findings = []
  const ablations = new Map(list(plan.ablations).map((ablation) => [ablation.id, ablation]))
  const components = list(plan.methodComponents)
  if (!components.length) {
    findings.push(
      make(
        'plan.component-unablated',
        'methodComponents',
        'The plan lists no method components, so ablation coverage cannot be checked: list every component.',
        ['/methodComponents']
      )
    )
  }
  for (const component of components) {
    const id = component.ablation
    const excused = (!hasText(id) || id === 'none') && hasText(component.reason)
    if (!excused && !ablations.has(id)) {
      findings.push(
        make(
          'plan.component-unablated',
          component.id,
          `Component ${component.id} (${component.name ?? ''}) has no ablation and no reason.`,
          [make.pointer('methodComponents', component.id)]
        )
      )
    }
  }
  for (const ablation of ablations.values()) {
    const missing = ['default', 'structure', 'budget'].filter((key) => !hasText(ablation[key]))
    if (missing.length) {
      findings.push(
        make(
          'plan.ablation-no-default',
          ablation.id,
          `Ablation ${ablation.id} does not name its ${missing.join(', ')}.`,
          [make.pointer('ablations', ablation.id)]
        )
      )
    }
  }
  const probes = list(plan.analysis).filter((entry) => entry.kind === 'mechanism-probe')
  for (const claim of list(plan.claims).filter(
    (entry) => entry.kind === 'mechanism' && entry.status !== 'argued-only'
  )) {
    if (!probes.length) {
      findings.push(
        make(
          'plan.mechanism-unprobed',
          claim.id,
          `Mechanism claim ${claim.id} has no mechanism-probe analysis measuring something other than the task metric.`,
          [make.pointer('claims', claim.id)]
        )
      )
    }
  }
  const hp = plan.hyperparameters ?? {}
  if (!list(hp.sensitivity).length && !hasText(hp.sensitivityReason)) {
    findings.push(
      make(
        'plan.hparam-sensitivity',
        'hyperparameters',
        "The method's own knobs have no sensitivity sweep and no reason (asked in 47% of papers).",
        ['/hyperparameters']
      )
    )
  }
  return findings
}

/** Every finding for one plan object, most severe first. */
export function planFindings(plan) {
  const make = findingFactory(plan)
  const findings = [
    ...claimChecks(plan, make),
    ...baselineChecks(plan, make),
    ...ablationChecks(plan, make),
    ...evaluationChecks(plan, make),
    ...budgetChecks(plan, make),
    ...reviewChecks(plan, make)
  ]
  return findings.sort(
    (left, right) => SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity]
  )
}

export function findingCounts(findings) {
  const counts = { fail: 0, warn: 0, info: 0 }
  for (const finding of findings) {
    counts[finding.severity] += 1
  }
  return counts
}

export async function checkPlan(projectPath, id) {
  const project = await realpath(projectPath)
  const planId = await resolvePlanId(project, id)
  const plan = await readPlanFile(project, planId)
  const findings = planFindings(plan)
  return { plan: planId, revision: plan.revision ?? 1, findings, summary: findingCounts(findings) }
}
