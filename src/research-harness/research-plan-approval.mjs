// The human decision path of a plan: the agent submits it; the person, in Aster, picks the cuts
// (each with a reason), decides the pre-mortem's "ask" items, states the compute and approves.
// Approval pins the revision and proposes the first stage's cells through the existing proposal
// flow, so every Run still waits for its own approval. Later stages are proposed by the person.

import { realpath } from 'node:fs/promises'
import { agentIdentityFromEnvironment } from './research-agent-identity.mjs'
import { readExperimentBrief, updateExperimentBrief } from './research-experiment-brief.mjs'
import { HarnessError } from './research-harness-error.mjs'
import { experimentSlug } from './research-layout.mjs'
import { libraryRequestsPath, requestLibraryPaper } from './research-library-requests.mjs'
import { findingCounts, planFindings } from './research-plan-checks.mjs'
import { budgetFit } from './research-plan-fit.mjs'
import {
  appendPlanDecision,
  readPlanDecisions,
  readPlanFile,
  resolvePlanId,
  writeManagedPlan
} from './research-plan.mjs'
import { hasText, isObject, list, textList } from './research-plan-schema.mjs'
import {
  closestPriorView,
  coverageMatrix,
  cutConsequences,
  planCellsView,
  premortemSummary,
  runOrder,
  tierTotals
} from './research-plan-view.mjs'
import { createExperiment } from './research-project.mjs'
import { addProposal } from './research-proposals.mjs'
import { existingExperiment, readLedgerEntries } from './research-jsonl-ledger.mjs'

function requireUser(by, action) {
  if (by !== 'user' || agentIdentityFromEnvironment()?.provider) {
    throw new HarnessError('not_allowed', `Only the person ${action}, in Aster`)
  }
}

function bareArxiv(value) {
  return hasText(value) ? value.trim().replace(/v\d+$/u, '') : null
}

function titleKey(value) {
  return hasText(value)
    ? value
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim()
    : null
}

function closestWhy(plan, entry) {
  const claims = list(plan.claims)
  const named = claims.find((claim) => claim.id === entry.claim)
  const main = claims.filter((claim) => claim.weight !== 'secondary').map((claim) => claim.id)
  const target = named
    ? `${named.id}: ${named.text ?? ''}`
    : main.length
      ? main.join(', ')
      : `plan ${plan.id}`
  return `closest prior method for ${target}`.slice(0, 500)
}

/**
 * Asks Aster to keep each closest prior method's paper in the project Library (the Library's own
 * request path: the person's setting decides whether it is added). Papers already requested are
 * skipped, so resubmitting does not ask twice. Never blocks the submission.
 */
async function requestClosestPapers(project, plan) {
  const earlier = await readLedgerEntries(libraryRequestsPath(project)).catch(() => [])
  const seen = new Set(
    earlier.flatMap((request) =>
      [bareArxiv(request.arxivId), request.doi?.toLowerCase(), titleKey(request.title)].filter(
        Boolean
      )
    )
  )
  const requested = []
  const failed = []
  for (const entry of list(plan.baselineSearch?.closest)) {
    const keys = [bareArxiv(entry.arxiv), entry.doi?.toLowerCase(), titleKey(entry.title)].filter(
      Boolean
    )
    if (!keys.length || keys.some((key) => seen.has(key))) {
      continue
    }
    keys.forEach((key) => seen.add(key))
    try {
      const { request } = await requestLibraryPaper(project, {
        arxiv: bareArxiv(entry.arxiv) ?? undefined,
        doi: hasText(entry.doi) ? entry.doi : undefined,
        title: entry.title,
        year: Number.isInteger(entry.year) ? entry.year : undefined,
        why: closestWhy(plan, entry),
        source: 'plan'
      })
      requested.push({
        id: request.id,
        arxiv: request.arxivId ?? null,
        doi: request.doi ?? null,
        title: entry.title
      })
    } catch (error) {
      failed.push({ title: entry.title, error: error.message })
    }
  }
  return { requested, failed }
}

/** The agent hands the plan over for the person's decision; blocked while fail findings remain. */
export async function submitPlan(projectPath, id) {
  const project = await realpath(projectPath)
  const planId = await resolvePlanId(project, id)
  const findings = planFindings(await readPlanFile(project, planId))
  const blocking = findings.filter((finding) => finding.severity === 'fail')
  if (blocking.length) {
    throw new HarnessError(
      'plan_blocked',
      `Fix these before submitting (plan check lists them): ${blocking.map((finding) => `${finding.check} ${finding.target}`).join(', ')}`
    )
  }
  const plan = await writeManagedPlan(project, planId, (previous) => ({
    ...previous,
    status: 'submitted'
  }))
  await appendPlanDecision(project, planId, {
    type: 'submit',
    revision: plan.revision,
    agent: agentIdentityFromEnvironment()
  })
  const library = await requestClosestPapers(project, plan)
  return {
    plan: planId,
    revision: plan.revision,
    status: plan.status,
    findings: findingCounts(findings),
    library
  }
}

/** Cells already proposed, from the decision ledger: cell → {experiment, proposal}. */
function proposedCells(decisions) {
  const proposed = new Map()
  for (const entry of decisions.filter((item) => item.type === 'materialize')) {
    for (const item of list(entry.cells)) {
      proposed.set(item.cell, {
        experiment: item.experiment,
        proposal: item.proposal,
        stage: entry.stage
      })
    }
  }
  return proposed
}

function questionExperimentName(question) {
  if (hasText(question.experiment)) {
    return question.experiment.trim()
  }
  const words = `${question.id} ${question.text ?? ''}`.split(/\s+/u)
  let name = ''
  for (const word of words) {
    if (`${name} ${word}`.trim().length > 56) {
      break
    }
    name = `${name} ${word}`.trim()
  }
  return name || question.id
}

async function experimentFor(project, plan, question) {
  const target = question ?? list(plan.questions)[0] ?? { id: plan.id, text: plan.title }
  const name = questionExperimentName(target)
  // Why: a question may name an Experiment that already exists under another display name.
  const existing = await existingExperiment(project, experimentSlug(name)).catch(() => null)
  const slug = existing ?? (await createExperiment(project, name)).slug
  if (question && !(await readExperimentBrief(project, slug))) {
    const primary = list(plan.metrics).find((metric) => metric.primary === true)
    const seeds = plan.statistics?.seedsMain
    await updateExperimentBrief(
      project,
      slug,
      {
        question: hasText(question.text) ? question.text : null,
        hypothesis: hasText(question.hypothesis) ? question.hypothesis : null,
        ...(primary && hasText(primary.name) && ['minimize', 'maximize'].includes(primary.direction)
          ? {
              primaryMetric: {
                name: primary.name,
                direction: primary.direction,
                split: hasText(primary.split) ? primary.split : null
              }
            }
          : {}),
        ...(Number.isInteger(seeds) && seeds >= 1 && seeds <= 20 ? { minSeeds: seeds } : {})
      },
      { by: 'agent' }
    )
  }
  return slug
}

function proposalText(plan, cell, stage, experiment) {
  const question = list(plan.questions).find((entry) => entry.id === cell.question)
  return {
    title: `${cell.cell}: ${cell.purpose}${cell.seeds > 1 ? ` × ${cell.seeds} seeds` : ''}`.slice(
      0,
      200
    ),
    rationale: [
      `Plan ${plan.id} revision ${plan.revision}, stage ${stage.id}${stage.gate ? ` (gate: ${stage.gate})` : ''}.`,
      question ? `Answers ${question.id}: ${question.text ?? ''}` : null,
      hasText(cell.expect) ? `Expect: ${cell.expect.replace(/[.\s]+$/u, '')}.` : null,
      cell.compareTo?.length ? `Compared with ${cell.compareTo.join(', ')}.` : null,
      cell.command
        ? null
        : 'No command yet: the agent writes it, or a Workbench chat implements it.'
    ]
      .filter(Boolean)
      .join(' ')
      .slice(0, 4000),
    command: hasText(cell.command)
      ? cell.command
      : `(not written yet) run exec --experiment ${experiment} --name "${cell.cell}" -- <command for ${JSON.stringify(cell.factors ?? {})}>`
  }
}

/** Proposes the kept, not yet proposed cells of one stage of an approved plan. */
async function materializeStage(project, plan, stageId, cut) {
  const stage = list(plan.stages).find((entry) => entry.id === stageId)
  if (!stage) {
    throw new HarnessError('not_found', `No stage ${stageId} in plan ${plan.id}`)
  }
  const proposed = proposedCells(await readPlanDecisions(project, plan.id))
  const questions = new Map(list(plan.questions).map((question) => [question.id, question]))
  const created = []
  for (const cell of list(plan.matrix).filter(
    (entry) => entry.stage === stageId && !cut.has(entry.cell) && !proposed.has(entry.cell)
  )) {
    const experiment = await experimentFor(project, plan, questions.get(cell.question) ?? null)
    const text = proposalText(plan, cell, stage, experiment)
    const result = await addProposal(project, {
      experiment,
      ...text,
      configChanges:
        isObject(cell.factors) && Object.keys(cell.factors).length
          ? { ...cell.factors, ...(cell.seeds > 1 ? { seeds: cell.seeds } : {}) }
          : null,
      needsCode: cell.needsCode === true || !hasText(cell.command),
      agent: plan.agent ?? null,
      plan: { id: plan.id, revision: plan.revision, cell: cell.cell }
    })
    created.push({ cell: cell.cell, experiment, proposal: result.proposal.id })
  }
  if (created.length) {
    await appendPlanDecision(project, plan.id, {
      type: 'materialize',
      revision: plan.revision,
      stage: stageId,
      cells: created,
      by: 'user'
    })
  }
  return created
}

function approvedCuts(plan) {
  return new Set(list(plan.approval?.cuts).map((cut) => cut.cell))
}

/**
 * The person's approval: the cuts (each with an out-of-scope reason), a decision for every "ask"
 * request, and the revision they looked at. Refused when the kept cells exceed their compute.
 */
export async function approvePlan(projectPath, id, input) {
  const project = await realpath(projectPath)
  const planId = await resolvePlanId(project, id)
  requireUser(input.by, 'approves a plan')
  const plan = await readPlanFile(project, planId)
  if (input.revision !== plan.revision) {
    throw new HarnessError(
      'stale_plan',
      `The plan changed (revision ${plan.revision}); review it again before approving`
    )
  }
  const cells = new Map(list(plan.matrix).map((cell) => [cell.cell, cell]))
  const cuts = new Map()
  for (const cut of list(input.cuts)) {
    if (!cells.has(cut.cell)) {
      throw new HarnessError('not_found', `No cell ${cut.cell} in the plan`)
    }
    if (!hasText(cut.reason)) {
      throw new HarnessError('invalid_argument', `Cutting ${cut.cell} needs an out-of-scope reason`)
    }
    cuts.set(cut.cell, cut.reason.trim().slice(0, 600))
  }
  const summary = premortemSummary(plan)
  const decisions = new Map(list(input.decisions).map((decision) => [decision.request, decision]))
  for (const requestId of summary.asks) {
    const decision = decisions.get(requestId)
    const request = summary.requests.find((entry) => entry.id === requestId)
    if (!decision || !['include', 'out-of-scope'].includes(decision.decision)) {
      throw new HarnessError(
        'decision_missing',
        `Decide ${requestId} ("${request.request}"): include it or leave it out`
      )
    }
    if (decision.decision === 'out-of-scope') {
      if (!hasText(decision.reason)) {
        throw new HarnessError('invalid_argument', `Leaving out ${requestId} needs a reason`)
      }
      for (const cell of request.cells) {
        cuts.set(cell, cuts.get(cell) ?? decision.reason.trim())
      }
    } else if (request.cells.length && request.cells.every((cell) => cuts.has(cell))) {
      throw new HarnessError(
        'invalid_argument',
        `${requestId} is included but all its cells are cut`
      )
    }
  }
  const cut = new Set(cuts.keys())
  const totals = tierTotals(plan, cut)
  if (!totals.budget.stated) {
    throw new HarnessError(
      'budget_unknown',
      'State your compute (GPU-hours) before approving, so the cuts can be checked against it'
    )
  }
  if (totals.totalGpuHours > totals.budget.gpuHours + 1e-9) {
    throw new HarnessError(
      'over_budget',
      `The kept cells need ${Number(totals.totalGpuHours.toFixed(1))} GPU-h of ${totals.budget.gpuHours}; cut more or state more compute`
    )
  }
  const open = planFindings(plan).filter((finding) => finding.severity !== 'info')
  const approval = {
    revision: plan.revision,
    at: new Date().toISOString(),
    by: 'user',
    cuts: [...cuts].map(([cell, reason]) => ({ cell, reason })),
    decisions: summary.asks.map((requestId) => ({
      request: requestId,
      decision: decisions.get(requestId).decision,
      reason: hasText(decisions.get(requestId).reason)
        ? decisions.get(requestId).reason.trim()
        : null
    })),
    keptGpuHours: totals.totalGpuHours,
    budgetGpuHours: totals.budget.gpuHours,
    openFindings: open.map((finding) => finding.id),
    consequences: cutConsequences(plan, cut)
  }
  const approved = await writeManagedPlan(project, planId, (previous) => ({
    ...previous,
    status: 'approved',
    approval,
    scope: {
      ...(isObject(previous.scope) ? previous.scope : {}),
      outOfScope: [
        ...list(previous.scope?.outOfScope).filter((entry) => !(entry.by === 'user' && entry.cell)),
        ...approval.cuts.map(({ cell, reason }) => ({
          item: `${cell} (${cells.get(cell).purpose})`,
          reason,
          by: 'user',
          cell
        }))
      ]
    }
  }))
  await appendPlanDecision(project, planId, { type: 'approval', ...approval })
  const first = runOrder(approved, cut).stages.find((stage) => stage.cells.length)
  const proposals = first ? await materializeStage(project, approved, first.id, cut) : []
  return { plan: planId, revision: approved.revision, status: approved.status, approval, proposals }
}

/** The person proposes a later stage once its gate has passed; cells already proposed are skipped. */
export async function proposePlanStage(projectPath, id, input) {
  const project = await realpath(projectPath)
  const planId = await resolvePlanId(project, id)
  requireUser(input.by, 'proposes a stage of the plan')
  const plan = await readPlanFile(project, planId)
  if (plan.status !== 'approved' || plan.approval?.revision !== plan.revision) {
    throw new HarnessError(
      'not_approved',
      'Approve this revision of the plan before proposing its stages'
    )
  }
  const proposals = await materializeStage(project, plan, input.stage, approvedCuts(plan))
  return { plan: planId, revision: plan.revision, stage: input.stage, proposals }
}

/** Everything the Plan view shows, computed in one read. */
export async function planOverview(projectPath, id) {
  const project = await realpath(projectPath)
  const planId = await resolvePlanId(project, id)
  const plan = await readPlanFile(project, planId)
  const decisions = await readPlanDecisions(project, planId)
  const findings = planFindings(plan)
  const approved = plan.status === 'approved' && plan.approval?.revision === plan.revision
  const cut = approved ? approvedCuts(plan) : new Set()
  const proposed = proposedCells(decisions)
  return {
    plan: {
      id: planId,
      title: plan.title ?? planId,
      method: plan.method ?? null,
      status: plan.status ?? 'draft',
      revision: plan.revision ?? 1,
      updatedAt: plan.updatedAt ?? null,
      approval: plan.approval ?? null,
      outOfScope: list(plan.scope?.outOfScope),
      stoppingRules: textList(plan.stoppingRules),
      decisionPoints: list(plan.decisionPoints)
    },
    document: plan,
    cells: planCellsView(plan).map((cell) => ({
      ...cell,
      proposed: proposed.get(cell.cell) ?? null
    })),
    tiers: tierTotals(plan, cut),
    fit: budgetFit(plan, cut),
    closest: closestPriorView(plan),
    coverage: coverageMatrix(plan, cut),
    order: runOrder(plan, cut),
    premortem: premortemSummary(plan),
    findings,
    summary: findingCounts(findings),
    cut: [...cut]
  }
}
