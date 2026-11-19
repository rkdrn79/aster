// Checklist D and E: evaluation protocol, statistics, coverage and the method's own cost.

import { hasText, list, textList } from './research-plan-schema.mjs'

const GENERALITY_FACTORS = [
  'dataset',
  'backbone',
  'model',
  'scale',
  'architecture',
  'domain',
  'hardware',
  'task'
]

export function comparisonCount(plan) {
  return list(plan.matrix)
    .filter((cell) => cell.purpose === 'main')
    .reduce((sum, cell) => sum + textList(cell.compareTo).length, 0)
}

function reportSplits(plan) {
  const splits = new Set()
  for (const metric of list(plan.metrics)) {
    if (hasText(metric.split)) {
      splits.add(metric.split.trim().toLowerCase())
    }
  }
  for (const dataset of list(plan.datasets)) {
    if (hasText(dataset.splits?.report)) {
      splits.add(
        dataset.splits.report
          .trim()
          .toLowerCase()
          .split(/[\s,;(]/u)[0]
      )
    }
  }
  return splits
}

function statisticsChecks(plan, make) {
  const findings = []
  const statistics = plan.statistics ?? {}
  const seedsMain = Number.isInteger(statistics.seedsMain) ? statistics.seedsMain : null
  // Why the default: plans often state seeds once ("3 seeds per setting") instead of per cell.
  const seedsOf = (cell) => (Number.isInteger(cell.seeds) ? cell.seeds : (seedsMain ?? 1))
  const floor = 3
  const thin = list(plan.matrix).filter((cell) => cell.purpose === 'main' && seedsOf(cell) < floor)
  if ((seedsMain !== null && seedsMain < 3) || thin.length) {
    findings.push(
      make(
        'plan.seeds-too-few',
        thin.length ? thin[0].cell : 'statistics',
        seedsMain !== null && seedsMain < 3
          ? `statistics.seedsMain is ${seedsMain}; main results need at least 3 seeds.`
          : `${thin.length} main cell${thin.length === 1 ? '' : 's'} plan fewer than ${floor} seeds: ${thin
              .map((cell) => `${cell.cell} (${seedsOf(cell)})`)
              .slice(0, 6)
              .join(', ')}.`,
        thin.length
          ? thin.slice(0, 6).map((cell) => make.pointer('matrix', cell.cell, 'cell'))
          : ['/statistics']
      )
    )
  }
  const missing = ['variance', 'repeatUnit'].filter((key) => !hasText(statistics[key]))
  if (missing.length) {
    findings.push(
      make(
        'plan.variance-unspecified',
        'statistics',
        `statistics has no ${missing.join(' or ')}: say what is repeated and how spread is reported.`,
        ['/statistics']
      )
    )
  }
  const tests = Array.isArray(statistics.test)
    ? textList(statistics.test)
    : hasText(statistics.test)
      ? [statistics.test]
      : []
  if (
    (!tests.length || tests.every((test) => test === 'none')) &&
    !hasText(statistics.testReason)
  ) {
    findings.push(
      make(
        'plan.difference-rule-missing',
        'statistics',
        'No rule for calling a win: set statistics.test (a paired test or a CI of the difference) or say why not in testReason.',
        ['/statistics']
      )
    )
  }
  const comparisons = comparisonCount(plan)
  if (comparisons > 10 && !hasText(statistics.multipleComparisons)) {
    findings.push(
      make(
        'plan.multiplicity',
        'statistics',
        `${comparisons} planned comparisons and no statistics.multipleComparisons rule.`,
        ['/statistics']
      )
    )
  }
  return findings
}

const VALIDATION = /\b(val|valid|validation|dev|held-out validation)\b/u

/** The split choices are made on: the plan's, else one every baseline or dataset names. */
function selectionSplit(plan) {
  if (hasText(plan.hyperparameters?.selectionSplit)) {
    return plan.hyperparameters.selectionSplit
  }
  const named = [
    ...list(plan.baselines).map((baseline) => baseline.fairness?.tuning?.selectionSplit),
    ...list(plan.datasets).map((dataset) => dataset.splits?.select)
  ].filter(hasText)
  return named.find((split) => /\btest\b/iu.test(split)) ?? named[0] ?? null
}

function protocolChecks(plan, make) {
  const findings = []
  const selection = selectionSplit(plan)
  const reports = reportSplits(plan)
  const selected = hasText(selection) ? selection.trim().toLowerCase() : null
  const onTest =
    selected &&
    ((/\btest\b/u.test(selected) && !VALIDATION.test(selected)) || reports.has(selected))
  if (!selected || onTest) {
    findings.push(
      make(
        'plan.selection-on-test',
        'hyperparameters',
        selected
          ? `Hyperparameters are selected on "${selection}", which is a report split; select on validation only.`
          : 'hyperparameters.selectionSplit is not set: name the validation split used for every choice.',
        ['/hyperparameters']
      )
    )
  }
  const protocol = plan.protocol ?? {}
  if (!hasText(protocol.checkpoint)) {
    findings.push(
      make(
        'plan.protocol-per-arm',
        'protocol',
        'No shared evaluation protocol: set protocol.checkpoint (last or last-K, never best-on-test), and decoding and post-processing where they apply, for every arm.',
        ['/protocol']
      )
    )
  } else if (/best/iu.test(protocol.checkpoint) && /test/iu.test(protocol.checkpoint)) {
    findings.push(
      make(
        'plan.protocol-per-arm',
        'protocol',
        `The checkpoint rule "${protocol.checkpoint}" selects on test.`,
        ['/protocol/checkpoint']
      )
    )
  } else if (protocol.bestOfK === true && protocol.appliedToAllArms !== true) {
    findings.push(
      make(
        'plan.protocol-per-arm',
        'protocol',
        'Best-of-k selection is planned without applying it to every arm (protocol.appliedToAllArms).',
        ['/protocol']
      )
    )
  }
  if (!list(plan.leakageChecks).length && !hasText(plan.leakageReason)) {
    findings.push(
      make(
        'plan.leakage-unchecked',
        'leakageChecks',
        'No leakage checks (test data in preprocessing, pretraining overlap, tuning on test) and no leakageReason.',
        ['/leakageChecks']
      )
    )
  }
  const metrics = list(plan.metrics)
  const unjustified = metrics.filter((metric) => !hasText(metric.why))
  if (!metrics.length || !metrics.some((metric) => metric.primary === true) || unjustified.length) {
    findings.push(
      make(
        'plan.metric-unjustified',
        'metrics',
        !metrics.length
          ? 'The plan lists no metrics.'
          : !metrics.some((metric) => metric.primary === true)
            ? 'No metric is marked primary.'
            : `Metrics without a reason: ${unjustified.map((metric) => metric.name).join(', ')}.`,
        ['/metrics']
      )
    )
  }
  const judged = metrics.filter((metric) => metric.judged === true)
  if (judged.length || plan.humanEval?.needed === true) {
    const validated = list(plan.matrix).some((cell) => cell.purpose === 'judge-validation')
    if (!validated) {
      findings.push(
        make(
          'plan.judge-unvalidated',
          judged[0]?.name ?? 'humanEval',
          `${judged.length ? `Judged metric ${judged.map((metric) => metric.name).join(', ')}` : 'Human evaluation'} has no judge-validation cell (a human-rated subset, agreement, order randomisation) before the main results.`,
          judged.length ? ['/metrics'] : ['/humanEval']
        )
      )
    }
  }
  return findings
}

function generalityFactors(plan, claim) {
  const evidence = new Set(textList(claim.evidence))
  const questions = new Set(
    list(plan.questions)
      .filter((question) => question.claim === claim.id || evidence.has(question.id))
      .map((question) => question.id)
  )
  const cells = list(plan.matrix).filter((cell) => questions.has(cell.question))
  return GENERALITY_FACTORS.some((factor) => {
    const values = new Set(
      cells
        .map((cell) => cell.factors?.[factor])
        .filter((value) => value !== undefined && value !== null)
        .map(String)
    )
    return values.size >= 2
  })
}

function coverageChecks(plan, make) {
  const findings = []
  const scope = plan.scope ?? {}
  const roles = new Set(list(plan.datasets).map((dataset) => dataset.role))
  if (
    !['heldout', 'ood', 'stress'].some((role) => roles.has(role)) &&
    !hasText(scope.heldoutReason)
  ) {
    findings.push(
      make(
        'plan.heldout-missing',
        'datasets',
        'No held-out, OOD or stress dataset, and no scope.heldoutReason (missing datasets or domains are asked in 70% of papers).',
        ['/datasets']
      )
    )
  }
  for (const claim of list(plan.claims).filter(
    (entry) => entry.kind === 'generality' && entry.status !== 'argued-only'
  )) {
    if (!generalityFactors(plan, claim)) {
      findings.push(
        make(
          'plan.generality-single-regime',
          claim.id,
          `Generality claim ${claim.id} is tested at only one regime (dataset family, backbone, scale or hardware).`,
          [make.pointer('claims', claim.id)]
        )
      )
    }
  }
  if (!list(scope.outOfScope).length) {
    findings.push(
      make(
        'plan.out-of-scope-empty',
        'scope',
        'scope.outOfScope is empty: list the settings deliberately not covered, with reasons, so "missing X" requests have a written answer.',
        ['/scope']
      )
    )
  }
  if (!list(plan.costMeasurements).length) {
    findings.push(
      make(
        'plan.cost-unmeasured',
        'costMeasurements',
        "The method's own cost (time, memory, FLOPs or tokens) against its main baseline is not measured (asked in 59% of papers).",
        ['/costMeasurements']
      )
    )
  }
  const kinds = new Set(list(plan.analysis).map((entry) => entry.kind))
  const missingKinds = [
    !kinds.has('failure-cases') && 'a failure-case analysis',
    !['slices', 'qualitative', 'mechanism-probe'].some((kind) => kinds.has(kind)) &&
      'a slice, qualitative or mechanism analysis'
  ].filter(Boolean)
  if (missingKinds.length) {
    findings.push(
      make(
        'plan.analysis-missing',
        'analysis',
        `No ${missingKinds.join(' and no ')} (analysis is asked in 71% of papers).`,
        ['/analysis']
      )
    )
  }
  const contingent = list(plan.analysis).filter((entry) => entry.kind === 'contingent')
  if (
    !contingent.some((entry) => hasText(entry.trigger) && typeof entry.budgetGpuHours === 'number')
  ) {
    findings.push(
      make(
        'plan.contingent-analysis-missing',
        'analysis',
        'No contingent analysis with a trigger and reserved GPU-hours ("after the main results, explain every setting where ours loses or ties").',
        ['/analysis']
      )
    )
  }
  return findings
}

export function evaluationChecks(plan, make) {
  return [
    ...statisticsChecks(plan, make),
    ...protocolChecks(plan, make),
    ...coverageChecks(plan, make)
  ]
}
