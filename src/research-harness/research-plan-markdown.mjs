// plan.md: the readable twin of plan.json, rewritten on every change. Never edit it by hand.

import { budgetFit, lossText } from './research-plan-fit.mjs'
import { cellCost, hasText, list, textList } from './research-plan-schema.mjs'
import {
  closestPriorView,
  coverageMatrix,
  planCellsView,
  premortemSummary,
  runOrder,
  tierTotals
} from './research-plan-view.mjs'

function cell(value) {
  return String(value ?? '')
    .replace(/\|/gu, '\\|')
    .replace(/\s+/gu, ' ')
    .trim()
}

function hours(value) {
  return value === null || value === undefined ? '?' : `${Number(value.toFixed(1))}`
}

function table(headers, rows) {
  if (!rows.length) {
    return []
  }
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(cell).join(' | ')} |`),
    ''
  ]
}

function section(title, lines) {
  return lines.length ? [`## ${title}`, '', ...lines] : []
}

function computeText(budget) {
  if (budget.gpuHours === null) {
    return 'Compute: not stated. The person picks a tier.'
  }
  const derivation = budget.derived
    ? ` (${budget.gpus} GPUs × ${budget.days ?? budget.wallclockDays} days)`
    : ''
  return `Compute: ${hours(budget.gpuHours)} GPU-h${derivation} (${budget.source ?? 'source not given'})${budget.hardware ? `, ${budget.hardware}` : ''}; ${Math.round(budget.reserve * 100)}% kept spare for reruns`
}

function fitLines(plan) {
  const fit = budgetFit(plan)
  if (fit.plannableGpuHours === null) {
    return []
  }
  const head = `Plannable ${hours(fit.plannableGpuHours)} GPU-h; the cells take ${hours(fit.keptGpuHours)}.`
  if (!fit.suggestions.length) {
    return [`${head} They fit.`, '']
  }
  return [
    `${head} To fit, the person would cut (lowest priority first; their decision in Aster):`,
    '',
    ...fit.suggestions.map(
      (entry) =>
        `- ${entry.cell} (${entry.tier}, ${hours(entry.gpuHours)} GPU-h): ${lossText(entry.loses) ?? 'no claim or reviewer request loses its evidence'}`
    ),
    ...(fit.fitsAfter ? [] : ['- Even with every suggested cut it does not fit.']),
    ''
  ]
}

function budgetLines(plan) {
  const { budget, tiers } = tierTotals(plan)
  return [
    computeText(budget),
    '',
    ...table(
      ['Tier', 'Cells', 'GPU-h', 'Cumulative', 'Fits'],
      tiers.map((tier) => [
        tier.tier,
        tier.cells.length,
        hours(tier.gpuHours),
        hours(tier.cumulativeGpuHours),
        tier.fits === null ? 'ask' : tier.fits ? 'yes' : 'no'
      ])
    ),
    ...fitLines(plan),
    ...listLines(
      list(plan.costBasis),
      (entry) =>
        `Unit cost: ${entry.what ?? entry.id ?? ''} ≈ ${typeof entry.gpuHours === 'number' ? `${hours(entry.gpuHours)} GPU-h` : '?'}${entry.basis ? ` (${entry.basis})` : ''}`
    )
  ]
}

function closestLines(plan) {
  return listLines(closestPriorView(plan), (entry) => {
    const id = entry.arxiv ? `arXiv ${entry.arxiv}` : entry.doi ? `DOI ${entry.doi}` : 'no id'
    const decision = entry.baseline
      ? `baseline ${entry.baseline}`
      : `not compared: ${entry.reason ?? 'no reason given'}`
    return `${entry.method ? `${entry.method}: ` : ''}${entry.title} (${[entry.year, id].filter(Boolean).join(', ')}) → ${decision}`
  })
}

function claimsLines(plan) {
  const coverage = coverageMatrix(plan)
  const questions = new Map(list(plan.questions).map((question) => [question.id, question]))
  return table(
    ['Claim', 'Weight', 'Questions', 'Status'],
    coverage.claims.map((claim) => [
      `${claim.id}: ${claim.text}`,
      claim.weight,
      claim.entries
        .map(
          (entry) =>
            `${entry.question} (${entry.cells.length} cell${entry.cells.length === 1 ? '' : 's'})`
        )
        .join(', ') || '—',
      claim.status
    ])
  ).concat(
    table(
      ['Question', 'Hypothesis', 'If false', 'Min effect'],
      [...questions.values()].map((question) => [
        `${question.id}: ${question.text ?? ''}`,
        question.hypothesis,
        question.predictionIfFalse,
        question.minEffect
      ])
    )
  )
}

function orderLines(plan) {
  const cells = new Map(list(plan.matrix).map((entry) => [entry.cell, entry]))
  const views = new Map(planCellsView(plan).map((entry) => [entry.cell, entry]))
  const byPriority = (left, right) =>
    (views.get(right)?.priority.score ?? 0) - (views.get(left)?.priority.score ?? 0)
  return runOrder(plan).stages.flatMap((stage) => [
    `### ${stage.id} ${stage.name} — ${hours(stage.gpuHours)} GPU-h${stage.budgetGpuHours === null ? '' : ` of ${hours(stage.budgetGpuHours)}`}`,
    '',
    `Gate: ${stage.gate ?? 'none'}`,
    '',
    ...table(
      ['Cell', 'Purpose', 'Tier · why', 'Factors', 'Seeds', 'GPU-h', 'Expect'],
      [...stage.cells].sort(byPriority).map((id) => {
        const entry = cells.get(id)
        const view = views.get(id)
        return [
          id,
          entry.purpose,
          `${view.effectiveTier} · ${view.priority.reasons.join(', ') || 'decides nothing'}`,
          factorText(entry.factors),
          entry.seeds ?? 1,
          hours(cellCost(entry)),
          entry.expect
        ]
      })
    )
  ])
}

function factorText(factors) {
  return factors && typeof factors === 'object'
    ? Object.entries(factors)
        .map(
          ([key, value]) => `${key}=${typeof value === 'object' ? JSON.stringify(value) : value}`
        )
        .join(', ')
    : ''
}

function evaluationLines(plan) {
  const statistics = plan.statistics ?? {}
  const hp = plan.hyperparameters ?? {}
  const protocol = plan.protocol ?? {}
  const facts = [
    ['Seeds (main)', statistics.seedsMain],
    ['Repeat unit', statistics.repeatUnit],
    ['Variance', statistics.variance],
    ['Win rule', [statistics.test].flat().filter(Boolean).join(', ') || statistics.testReason],
    ['Multiple comparisons', statistics.multipleComparisons],
    ['Selection split', hp.selectionSplit],
    ['Tuning trials (method)', hp.methodTrials],
    ['Saturation check', hp.saturationCheck],
    [
      'Sensitivity',
      list(hp.sensitivity)
        .map((entry) => `${entry.knob} ${JSON.stringify(entry.levels ?? [])}`)
        .join('; ') || hp.sensitivityReason
    ],
    ['Checkpoint rule', protocol.checkpoint],
    ['Decoding', protocol.decoding],
    [
      'Human evaluation',
      plan.humanEval
        ? `${plan.humanEval.needed ? 'needed' : 'not needed'}${plan.humanEval.reason ? ` — ${plan.humanEval.reason}` : ''}`
        : null
    ]
  ].filter(([, value]) => value !== undefined && value !== null && value !== '')
  return [
    ...table(
      ['Dataset', 'Role', 'Splits', 'Why'],
      list(plan.datasets).map((dataset) => [
        `${dataset.id}: ${dataset.name ?? ''}${dataset.replaces ? ` (replaces ${dataset.replaces})` : ''}`,
        dataset.role,
        dataset.splits ? factorText(dataset.splits) : '',
        dataset.why
      ])
    ),
    ...table(
      ['Metric', 'Direction', 'Split', 'Primary', 'Why'],
      list(plan.metrics).map((metric) => [
        metric.name,
        metric.direction,
        metric.split,
        metric.primary ? 'yes' : '',
        metric.why
      ])
    ),
    ...listLines(facts, ([label, value]) => `${label}: ${value}`),
    ...listLines(
      list(plan.leakageChecks),
      (entry) => `Leakage check: ${entry.what ?? ''} — ${entry.how ?? ''}`
    )
  ]
}

function costAnalysisLines(plan) {
  return [
    ...listLines(
      list(plan.costMeasurements),
      (entry) =>
        `Cost: ${[entry.what].flat().join(', ')} for ${[entry.methods].flat().join(', ')}${entry.protocol ? ` (${entry.protocol})` : ''}`
    ),
    ...listLines(
      list(plan.analysis),
      (entry) =>
        `${entry.id} ${entry.kind ?? ''}: ${entry.question ?? ''}${entry.trigger ? ` — when ${entry.trigger}` : ''}${typeof entry.budgetGpuHours === 'number' ? ` (${entry.budgetGpuHours} GPU-h reserved)` : ''}`
    )
  ]
}

function listLines(items, render) {
  return items.map((item) => `- ${render(item)}`).concat(items.length ? [''] : [])
}

/** The plan as Markdown for people and for agents without the JSON. */
export function planMarkdown(plan) {
  const premortem = premortemSummary(plan)
  const outOfScope = list(plan.scope?.outOfScope)
  return [
    `# ${plan.title ?? plan.id}`,
    '',
    `Plan ${plan.id} · revision ${plan.revision ?? 1} · ${plan.status ?? 'draft'}${plan.approval?.revision ? ` · approved revision ${plan.approval.revision}` : ''}`,
    '',
    'Written by Aster from plan.json; edit the plan with `plan set`, not this file.',
    '',
    ...(hasText(plan.method) ? [plan.method, ''] : []),
    ...section('Budget', budgetLines(plan)),
    ...section('Claims and questions', claimsLines(plan)),
    ...section('Closest prior methods', closestLines(plan)),
    ...section(
      'Baselines',
      table(
        ['Baseline', 'Role', 'Source', 'Tuning trials', 'Why'],
        list(plan.baselines).map((baseline) => [
          `${baseline.id}: ${baseline.name ?? ''}`,
          baseline.role,
          baseline.source,
          baseline.fairness?.tuning?.trials,
          baseline.why
        ])
      ).concat(
        listLines(
          list(plan.notCompared),
          (entry) => `Not compared: ${entry.name} — ${entry.reason}`
        )
      )
    ),
    ...section(
      'Ablations',
      listLines(
        list(plan.methodComponents),
        (component) =>
          `${component.id} ${component.name ?? ''}: ${component.ablation && component.ablation !== 'none' ? component.ablation : `no ablation — ${component.reason ?? 'no reason given'}`}`
      )
    ),
    ...section('Evaluation', evaluationLines(plan)),
    ...section('Cost and analysis', costAnalysisLines(plan)),
    ...section('Run order', orderLines(plan)),
    ...section(
      'Decision points',
      listLines(
        list(plan.decisionPoints),
        (point) =>
          `After ${point.after}: if ${point.if}, then ${point.then}; else ${point.else ?? '—'}`
      )
    ),
    ...section(
      'Stopping rules',
      listLines(textList(plan.stoppingRules), (rule) => rule)
    ),
    ...section(
      'Out of scope',
      listLines(
        outOfScope,
        (entry) =>
          `${entry.item} — ${entry.reason ?? 'no reason given'}${entry.by === 'user' ? ' (the person)' : ''}`
      )
    ),
    ...section(
      'Reviewer pre-mortem',
      table(
        ['ID', 'Reviewer', 'Category', 'Request', 'Likelihood', 'Decision'],
        premortem.requests.map((request) => [
          request.id,
          request.reviewer,
          request.categoryLabel,
          request.request,
          request.likelihood,
          request.resolution
            ? `${request.resolution}${request.items.length ? `: ${request.items.join(', ')}` : ''}${request.reason ? ` — ${request.reason}` : ''}`
            : 'open'
        ])
      )
    ),
    ...section(
      'Risks',
      listLines(
        list(plan.risks),
        (risk) => `${risk.text ?? ''}${risk.mitigation ? ` — ${risk.mitigation}` : ''}`
      )
    )
  ].join('\n')
}
