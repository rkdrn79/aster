import { lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { agentIdentityFromEnvironment } from './research-agent-identity.mjs'
import { withFileLock, writeJsonAtomically } from './research-file-transactions.mjs'
import { HarnessError } from './research-harness-error.mjs'
import { appendLedgerEntry, nextLedgerId, readLedgerEntries } from './research-jsonl-ledger.mjs'
import { layoutRelativePaths, researchPaths } from './research-layout.mjs'
import { planMarkdown } from './research-plan-markdown.mjs'
import {
  CONTENT_KEYS,
  MANAGED_KEYS,
  PLAN_SCHEMA,
  PLAN_STATUSES,
  USER_CLAIM_STATUSES,
  assertValidPlanContent,
  finiteNumber,
  hasText,
  isObject,
  list
} from './research-plan-schema.mjs'

const PLAN_ID = /^[a-z0-9][a-z0-9-]{0,47}$/u

export function safePlanId(value) {
  if (typeof value !== 'string' || !PLAN_ID.test(value)) {
    throw new HarnessError(
      'invalid_argument',
      'Plan ID must use 1–48 lowercase letters, digits, or hyphens'
    )
  }
  return value
}

/** A plan ID from a title: ASCII words joined by hyphens. */
export function planIdFromTitle(title) {
  const slug = String(title ?? '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 48)
    .replace(/-+$/u, '')
  return slug || 'plan'
}

export function plansDirectory(project) {
  return path.join(researchPaths(project).root, 'plans')
}

export function planPaths(project, id) {
  const directory = path.join(plansDirectory(project), safePlanId(id))
  return {
    directory,
    plan: path.join(directory, 'plan.json'),
    markdown: path.join(directory, 'plan.md'),
    decisions: path.join(directory, 'decisions.jsonl')
  }
}

export function planRelativeDirectory(project, id) {
  return `${layoutRelativePaths(project).root}/plans/${safePlanId(id)}`
}

async function isFile(target) {
  return lstat(target).then(
    (details) => details.isFile() && !details.isSymbolicLink(),
    () => false
  )
}

async function planIds(project) {
  const names = await readdir(plansDirectory(project)).catch((error) => {
    if (error?.code === 'ENOENT') {
      return []
    }
    throw error
  })
  const found = []
  for (const name of names.sort()) {
    if (PLAN_ID.test(name) && (await isFile(planPaths(project, name).plan))) {
      found.push(name)
    }
  }
  return found
}

/** The plan a command means: the one named, or the project's only one. */
export async function resolvePlanId(project, id) {
  if (id) {
    return safePlanId(id)
  }
  const ids = await planIds(project)
  if (ids.length === 1) {
    return ids[0]
  }
  throw new HarnessError(
    ids.length ? 'ambiguous_plan' : 'plan_not_found',
    ids.length
      ? `This project has several plans (${ids.join(', ')}); pass --plan`
      : 'This project has no plan yet; create one with plan new'
  )
}

export async function readPlanFile(project, id) {
  const target = planPaths(project, id).plan
  if (!(await isFile(target))) {
    throw new HarnessError('plan_not_found', `No plan ${id} in this project`)
  }
  const plan = JSON.parse(await readFile(target, 'utf8'))
  if (!isObject(plan)) {
    throw new HarnessError(
      'invalid_layout',
      `${planRelativeDirectory(project, id)}/plan.json is not a JSON object`
    )
  }
  return plan
}

export async function readPlanDecisions(project, id) {
  return readLedgerEntries(planPaths(project, id).decisions)
}

async function writePlanFiles(project, plan) {
  const paths = planPaths(project, plan.id)
  await mkdir(paths.directory, { recursive: true })
  await writeJsonAtomically(paths.plan, plan)
  await writeFile(paths.markdown, planMarkdown(plan))
}

// Why: content() keeps only plan fields, so a misspelt field would vanish silently without this.
function refuseUnknownFields(input) {
  const unknown = Object.keys(input).filter(
    (key) => !CONTENT_KEYS.includes(key) && !MANAGED_KEYS.includes(key)
  )
  if (unknown.length) {
    throw new HarnessError(
      'invalid_plan',
      `The plan has unknown fields:\n- ${unknown.map((key) => `${key}: is not a plan field (fields: ${CONTENT_KEYS.join(', ')})`).join('\n- ')}`
    )
  }
}

function content(plan) {
  return Object.fromEntries(
    CONTENT_KEYS.filter((key) => key in plan).map((key) => [key, plan[key]])
  )
}

function actor(by) {
  if (by === undefined || by === null) {
    return agentIdentityFromEnvironment()?.provider ? 'agent' : 'user'
  }
  if (!['agent', 'user'].includes(by)) {
    throw new HarnessError('invalid_argument', '--by must be agent or user')
  }
  if (by === 'user' && agentIdentityFromEnvironment()?.provider) {
    throw new HarnessError(
      'not_allowed',
      'An agent cannot write as the user; the user edits in Aster'
    )
  }
  return by
}

// Why: results change a claim's status only through the person (playbook §6.5).
function refuseUserOnlyChanges(previous, next, by) {
  if (by === 'user') {
    return
  }
  const before = new Map(list(previous?.claims).map((claim) => [claim.id, claim.status]))
  for (const claim of list(next.claims)) {
    if (USER_CLAIM_STATUSES.includes(claim.status) && before.get(claim.id) !== claim.status) {
      throw new HarnessError(
        'not_allowed',
        `Claim ${claim.id} status ${claim.status} is the user's decision; agents write planned or argued-only`
      )
    }
  }
  const budget = next.scope?.compute
  const old = previous?.scope?.compute
  if (
    old?.source === 'user' &&
    budget &&
    finiteNumber(budget.gpuHours) !== finiteNumber(old.gpuHours)
  ) {
    throw new HarnessError(
      'not_allowed',
      'The person stated this budget in Aster; ask them before changing scope.compute.gpuHours'
    )
  }
}

function summary(project, plan) {
  return {
    id: plan.id,
    title: hasText(plan.title) ? plan.title : plan.id,
    status: PLAN_STATUSES.includes(plan.status) ? plan.status : 'draft',
    revision: Number.isInteger(plan.revision) ? plan.revision : 1,
    updatedAt: plan.updatedAt ?? null,
    path: `${planRelativeDirectory(project, plan.id)}/plan.json`
  }
}

export async function listPlans(projectPath) {
  const project = await realpath(projectPath)
  const plans = []
  for (const id of await planIds(project)) {
    plans.push(summary(project, await readPlanFile(project, id)))
  }
  return { directory: `${layoutRelativePaths(project).root}/plans`, plans }
}

export async function showPlan(projectPath, id) {
  const project = await realpath(projectPath)
  const planId = await resolvePlanId(project, id)
  const plan = await readPlanFile(project, planId)
  return { ...summary(project, plan), plan, markdown: planMarkdown(plan) }
}

/** Creates `.aster/plans/<id>/` with a draft plan, from a title and optional content. */
export async function createPlan(projectPath, input) {
  const project = await realpath(projectPath)
  const initial = isObject(input.content) ? input.content : {}
  refuseUnknownFields(initial)
  const title = hasText(input.title)
    ? input.title.trim()
    : hasText(initial.title)
      ? initial.title.trim()
      : ''
  if (!title || title.length > 200) {
    throw new HarnessError('invalid_argument', 'A plan needs a title of 1–200 characters')
  }
  const id = input.id ? safePlanId(input.id) : planIdFromTitle(title)
  const by = actor(input.by)
  const next = { ...content(initial), title }
  assertValidPlanContent(next)
  refuseUserOnlyChanges(null, next, by)
  const paths = planPaths(project, id)
  await mkdir(paths.directory, { recursive: true })
  return withFileLock(`${paths.plan}.lock`, async () => {
    if (await isFile(paths.plan)) {
      throw new HarnessError('already_exists', `Plan ${id} already exists; change it with plan set`)
    }
    const now = new Date().toISOString()
    const plan = {
      schema: PLAN_SCHEMA,
      id,
      revision: 1,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      updatedBy: by,
      agent: by === 'agent' ? agentIdentityFromEnvironment() : null,
      approval: null,
      ...next
    }
    await writePlanFiles(project, plan)
    return { ...summary(project, plan), plan }
  })
}

/**
 * Replaces the plan's content (or, with `merge`, only the top-level fields given). Every change
 * bumps the revision and returns the plan to draft, so an approval always names what it approved.
 */
export async function updatePlan(projectPath, id, patch, { merge = false, by: byInput } = {}) {
  const project = await realpath(projectPath)
  const planId = await resolvePlanId(project, id)
  if (!isObject(patch)) {
    throw new HarnessError('invalid_argument', 'The plan must be a JSON object')
  }
  refuseUnknownFields(patch)
  const by = actor(byInput)
  const paths = planPaths(project, planId)
  return withFileLock(`${paths.plan}.lock`, async () => {
    const previous = await readPlanFile(project, planId)
    const next = merge ? { ...content(previous), ...content(patch) } : content(patch)
    if (!hasText(next.title)) {
      next.title = previous.title
    }
    assertValidPlanContent(next)
    refuseUserOnlyChanges(previous, next, by)
    const plan = {
      schema: PLAN_SCHEMA,
      id: planId,
      revision: (Number.isInteger(previous.revision) ? previous.revision : 0) + 1,
      status: 'draft',
      createdAt: previous.createdAt ?? null,
      updatedAt: new Date().toISOString(),
      updatedBy: by,
      agent: by === 'agent' ? agentIdentityFromEnvironment() : (previous.agent ?? null),
      approval: previous.approval ?? null,
      ...next
    }
    await writePlanFiles(project, plan)
    return { ...summary(project, plan), plan }
  })
}

/** Writes the plan with harness-managed changes (status, approval) without touching content. */
export async function writeManagedPlan(project, id, change) {
  const paths = planPaths(project, id)
  return withFileLock(`${paths.plan}.lock`, async () => {
    const previous = await readPlanFile(project, id)
    const plan = await change(previous)
    await writePlanFiles(project, plan)
    return plan
  })
}

export async function appendPlanDecision(project, id, entry) {
  const target = planPaths(project, id).decisions
  return withFileLock(`${target}.lock`, async () => {
    const entries = await readLedgerEntries(target)
    const recorded = {
      schemaVersion: 1,
      id: nextLedgerId(entries, entry.type),
      at: new Date().toISOString(),
      ...entry
    }
    await appendLedgerEntry(target, recorded)
    return recorded
  })
}

/** The person's stated compute, from Aster: it replaces any budget the plan carried. */
export async function setPlanBudget(projectPath, id, input) {
  const project = await realpath(projectPath)
  const planId = await resolvePlanId(project, id)
  if (input.by !== 'user' || actor(input.by) !== 'user') {
    throw new HarnessError(
      'not_allowed',
      'Only the person states the compute budget (--by user), in Aster'
    )
  }
  const gpuHours = finiteNumber(input.gpuHours)
  if (gpuHours === null || gpuHours < 0 || gpuHours > 10_000_000) {
    throw new HarnessError('invalid_argument', 'GPU-hours must be a non-negative number')
  }
  const plan = await writeManagedPlan(project, planId, (previous) => ({
    ...previous,
    revision: (previous.revision ?? 0) + 1,
    updatedAt: new Date().toISOString(),
    updatedBy: 'user',
    scope: {
      ...(isObject(previous.scope) ? previous.scope : {}),
      compute: {
        ...(isObject(previous.scope?.compute) ? previous.scope.compute : {}),
        gpuHours,
        ...(hasText(input.hardware) ? { hardware: input.hardware.trim().slice(0, 200) } : {}),
        source: 'user'
      }
    }
  }))
  await appendPlanDecision(project, planId, {
    type: 'budget',
    revision: plan.revision,
    gpuHours,
    by: 'user'
  })
  return { ...summary(project, plan), plan }
}
