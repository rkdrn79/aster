// The reviewer pre-mortem: simulated reviewers read the method, the claims and the draft plan and
// say which experiments they would demand, grounded in the project's Library, the agent's own
// literature search and the measured rates of reviewer requests. Each request then becomes a plan
// item, an out-of-scope note with a reason, or a cost the person decides on ("ask").

import { readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import { readCatalog } from './research-catalog.mjs'
import { HarnessError } from './research-harness-error.mjs'
import { layoutRelativePaths } from './research-layout.mjs'
import {
  PREMORTEM_REVIEWERS,
  REVIEW_CATEGORIES,
  REVIEW_CATEGORY_IDS,
  premortemReviewer,
  reviewerCategories
} from './research-plan-reviewers.mjs'
import { readPlanFile, resolvePlanId, updatePlan } from './research-plan.mjs'
import { hasText, isObject, list, textList } from './research-plan-schema.mjs'

const MAX_LIBRARY = 60
const MAX_BIB_BYTES = 2 * 1024 * 1024
const MAX_REQUESTS_PER_REVIEWER = 8

/** Titles and keys from the project's bibliography: the Library the reviewers know. */
export function bibliographyEntries(text) {
  const entries = []
  const pattern = /@(\w+)\s*\{\s*([^,\s]+)\s*,([\s\S]*?)(?=\n\s*@\w+\s*\{|$)/gu
  for (const match of text.matchAll(pattern)) {
    if (['comment', 'string', 'preamble'].includes(match[1].toLowerCase())) {
      continue
    }
    const field = (name) =>
      new RegExp(`\\b${name}\\s*=\\s*[{"]([^]*?)[}"]\\s*,?\\s*(?:\\n|$)`, 'iu').exec(match[3])?.[1]
    const title = field('title')?.replace(/[{}]/gu, '').replace(/\s+/gu, ' ').trim()
    if (title) {
      entries.push({ key: match[2], title, year: field('year')?.trim() ?? null })
    }
    if (entries.length >= MAX_LIBRARY) {
      break
    }
  }
  return entries
}

export async function projectLibrary(project) {
  const catalog = await readCatalog(project).catch(() => null)
  const relative = catalog?.references?.bibliography ?? layoutRelativePaths(project).bibliography
  const target = path.resolve(project, relative)
  if (path.relative(project, target).startsWith('..')) {
    return { path: relative, entries: [] }
  }
  const text = await readFile(target, 'utf8').catch(() => '')
  return { path: relative, entries: bibliographyEntries(text.slice(0, MAX_BIB_BYTES)) }
}

function planDigest(plan) {
  const lines = []
  for (const claim of list(plan.claims)) {
    lines.push(
      `- Claim ${claim.id} (${claim.weight ?? 'main'}, ${claim.kind ?? 'kind not set'}${claim.status === 'argued-only' ? ', argued only' : ''}): ${claim.text ?? ''}`
    )
  }
  for (const component of list(plan.methodComponents)) {
    lines.push(
      `- Component ${component.id}: ${component.name ?? ''}${component.ablation && component.ablation !== 'none' ? ` (ablation ${component.ablation})` : component.reason ? ` (not ablated: ${component.reason})` : ''}`
    )
  }
  for (const baseline of list(plan.baselines)) {
    lines.push(
      `- Baseline ${baseline.id}: ${baseline.name ?? ''} (${baseline.role ?? 'no role'}, ${baseline.source ?? 'source not set'})`
    )
  }
  for (const entry of list(plan.notCompared)) {
    lines.push(`- Not compared: ${entry.name ?? ''} — ${entry.reason ?? 'no reason'}`)
  }
  for (const dataset of list(plan.datasets)) {
    lines.push(`- Dataset ${dataset.id}: ${dataset.name ?? ''} (${dataset.role ?? 'role not set'})`)
  }
  for (const metric of list(plan.metrics)) {
    lines.push(
      `- Metric ${metric.name ?? ''} (${metric.direction ?? ''}${metric.primary ? ', primary' : ''})`
    )
  }
  for (const entry of list(plan.scope?.outOfScope)) {
    lines.push(`- Out of scope: ${entry.item ?? ''} — ${entry.reason ?? ''}`)
  }
  lines.push(
    `- Matrix: ${list(plan.matrix).length} cells over stages ${
      list(plan.stages)
        .map((stage) => stage.id)
        .join(', ') || '(none)'
    }; plan.md holds the full table`
  )
  return lines
}

function closestLines(plan) {
  const baselines = new Map(list(plan.baselines).map((baseline) => [baseline.id, baseline]))
  const closest = list(plan.baselineSearch?.closest)
  if (!closest.length) {
    return ['Closest prior methods: none recorded yet (judge the baselines without them).']
  }
  return [
    'Closest prior methods the planning agent found (it compares against each or says why not):',
    ...closest.map((entry) => {
      const id = hasText(entry.arxiv)
        ? `arXiv ${entry.arxiv}`
        : hasText(entry.doi)
          ? `DOI ${entry.doi}`
          : null
      const baseline = baselines.get(entry.baseline)
      return `- ${entry.method ? `${entry.method}: ` : ''}${entry.title ?? ''}${[entry.year, id].filter(Boolean).length ? ` (${[entry.year, id].filter(Boolean).join(', ')})` : ''} → ${baseline ? `baseline ${baseline.id}` : `not compared: ${entry.reason ?? 'no reason given'}`}`
    })
  ]
}

function literatureLines(plan, library) {
  const search = list(plan.baselineSearch?.found ?? plan.baselineSearch?.candidates)
  return [
    ...closestLines(plan),
    `Project Library (${library.path}), ${library.entries.length} entries${library.entries.length ? ':' : '. It is empty; rely on the literature list below.'}`,
    ...library.entries.map(
      (entry) => `- [${entry.key}] ${entry.title}${entry.year ? ` (${entry.year})` : ''}`
    ),
    `Literature the planning agent found (plan.baselineSearch; sources: ${textList(plan.baselineSearch?.sources).join(', ') || 'none recorded'}):`,
    ...(search.length
      ? search.map(
          (entry) =>
            `- ${entry.name ?? entry.title ?? ''}${entry.year ? ` (${entry.year})` : ''}${entry.why ? `: ${entry.why}` : ''}`
        )
      : list(plan.baselineSearch?.closest).length
        ? ['- (only the closest prior methods above)']
        : [
            "- (none recorded: search the Library, the manuscript's related work, papers citing the closest prior method and leaderboards first)"
          ])
  ]
}

/**
 * The brief for one simulated reviewer, in the style of the Rebuttal page's reviewer agents: who
 * it plays, what it read, how to stay in character, and the JSON it must return.
 */
export function premortemBriefText(plan, library, reviewerId, { cli = 'node H/cli.mjs' } = {}) {
  const reviewer = premortemReviewer(reviewerId)
  if (!reviewer) {
    throw new HarnessError(
      'invalid_argument',
      `Reviewer must be one of ${PREMORTEM_REVIEWERS.map((entry) => entry.id).join(', ')}`
    )
  }
  const own = reviewerCategories(reviewer.id)
  return [
    `You are simulating ${reviewer.id}, ${reviewer.name}, reviewing this paper at a top ML venue BEFORE its experiments run, so the authors can plan for what reviewers will demand. You are not a real reviewer; never claim to be.`,
    `Expertise: ${reviewer.expertise}. You value ${reviewer.values}. Tone: ${reviewer.tone}.`,
    '',
    `Read the plan: \`${cli} plan show --plan ${plan.id}\` (plan.md in .aster/plans/${plan.id}/) and the manuscript if there is one. The method:`,
    hasText(plan.method)
      ? plan.method
      : "(plan.method is empty: read the manuscript or the plan's claims)",
    '',
    'The claims and the plan in brief:',
    ...planDigest(plan),
    '',
    ...literatureLines(plan, library),
    '',
    'How often reviewers ask for each kind of experiment (share of 167 ICLR/NeurIPS papers with at least one such request in 682 reviews). Yours are marked *:',
    ...REVIEW_CATEGORIES.map(
      (category) =>
        `- ${category.reviewer === reviewer.id ? '* ' : ''}${category.id} (${category.rate}%): ${category.ask}`
    ),
    '',
    'Stay in character:',
    `- List the experiments YOU would demand, at most ${MAX_REQUESTS_PER_REVIEWER}, most likely first. Cover each of your starred categories that applies, and any other request you would truly make.`,
    '- Be concrete: name the prior method, dataset, component, regime or measurement, as a reviewer would ("compare against <method> on <dataset>", "what does <component> cost per step?"). Prefer methods from the Library and the literature list; name a method from memory only when you are sure it exists and say so in why.',
    '- Judge the plan as written: ask for what it leaves out or does unfairly, not for what it already has. Do not soften or exaggerate: most requests are medium or low.',
    '- Never invent results, numbers or citations. You do not design the plan or fix it; you only demand.',
    '',
    'Return JSON only, this shape:',
    `{"reviewer":"${reviewer.id}","requests":[{"category":"${own[0]?.id ?? 'missing-baseline'}","request":"…","why":"which claim or gap makes you ask","likelihood":"high|medium|low","names":["methods or datasets named"]}]}`,
    `Categories: ${REVIEW_CATEGORY_IDS.join(', ')}. "likelihood" is how likely a real reviewer of this paper asks it: high (more likely than not), medium (about one in three), low.`,
    `The planning agent records it with \`${cli} plan premortem record --plan ${plan.id} --file -\`.`
  ].join('\n')
}

export async function premortemBrief(projectPath, id, { reviewer = null, cli } = {}) {
  const project = await realpath(projectPath)
  const planId = await resolvePlanId(project, id)
  const plan = await readPlanFile(project, planId)
  const library = await projectLibrary(project)
  const reviewers = reviewer ? [reviewer] : PREMORTEM_REVIEWERS.map((entry) => entry.id)
  return {
    plan: planId,
    revision: plan.revision ?? 1,
    library: { path: library.path, entries: library.entries.length },
    briefs: reviewers.map((reviewerId) => ({
      reviewer: reviewerId,
      prompt: premortemBriefText(plan, library, reviewerId, { cli })
    }))
  }
}

function nextRequestNumber(requests) {
  return requests.reduce((highest, request) => {
    const match = /^PM(\d+)$/u.exec(request.id ?? '')
    return match ? Math.max(highest, Number(match[1])) : highest
  }, 0)
}

function checkedRequest(input, reviewer, index) {
  if (!isObject(input) || !hasText(input.request)) {
    throw new HarnessError('invalid_argument', `requests[${index}] needs a request text`)
  }
  if (!REVIEW_CATEGORY_IDS.includes(input.category)) {
    throw new HarnessError(
      'invalid_argument',
      `requests[${index}].category must be one of ${REVIEW_CATEGORY_IDS.join(', ')}`
    )
  }
  return {
    reviewer,
    category: input.category,
    request: input.request.trim().slice(0, 600),
    why: hasText(input.why) ? input.why.trim().slice(0, 600) : null,
    likelihood: ['high', 'medium', 'low'].includes(input.likelihood) ? input.likelihood : 'medium',
    names: textList(input.names).slice(0, 8)
  }
}

/**
 * Records one simulated reviewer's requests (replacing that reviewer's earlier, unresolved ones)
 * as PM-numbered items in plan.premortem; resolutions are added with `plan premortem resolve`.
 */
export async function recordPremortem(projectPath, id, input) {
  const project = await realpath(projectPath)
  const planId = await resolvePlanId(project, id)
  const reviewer = input?.reviewer
  if (!premortemReviewer(reviewer)) {
    throw new HarnessError(
      'invalid_argument',
      `"reviewer" must be one of ${PREMORTEM_REVIEWERS.map((entry) => entry.id).join(', ')}`
    )
  }
  const incoming = Array.isArray(input.requests) ? input.requests : []
  if (!incoming.length || incoming.length > MAX_REQUESTS_PER_REVIEWER * 2) {
    throw new HarnessError(
      'invalid_argument',
      `"requests" needs 1–${MAX_REQUESTS_PER_REVIEWER * 2} items`
    )
  }
  const plan = await readPlanFile(project, planId)
  const kept = list(plan.premortem?.requests).filter(
    (request) => request.reviewer !== reviewer || request.resolution
  )
  let number = nextRequestNumber(list(plan.premortem?.requests))
  const added = incoming.map((request, index) => ({
    id: `PM${(number += 1)}`,
    ...checkedRequest(request, reviewer, index),
    resolution: null
  }))
  const premortem = {
    ...(isObject(plan.premortem) ? plan.premortem : {}),
    ranAt: new Date().toISOString(),
    requests: [...kept, ...added]
  }
  const result = await updatePlan(project, planId, { premortem }, { merge: true })
  return { ...result, added: added.map((request) => request.id) }
}

/** Resolves requests: into plan items, out of scope with a reason, or a cost the person decides. */
export async function resolvePremortem(projectPath, id, input) {
  const project = await realpath(projectPath)
  const planId = await resolvePlanId(project, id)
  const resolutions = Array.isArray(input?.resolutions) ? input.resolutions : []
  if (!resolutions.length) {
    throw new HarnessError(
      'invalid_argument',
      '"resolutions" needs at least one {"id","as",…} item'
    )
  }
  const plan = await readPlanFile(project, planId)
  const requests = list(plan.premortem?.requests).map((request) => ({ ...request }))
  const outOfScope = list(plan.scope?.outOfScope).map((entry) => ({ ...entry }))
  for (const [index, resolution] of resolutions.entries()) {
    const request = requests.find((entry) => entry.id === resolution?.id)
    if (!request) {
      throw new HarnessError('not_found', `resolutions[${index}]: no request ${resolution?.id}`)
    }
    if (!['plan', 'out-of-scope', 'ask'].includes(resolution.as)) {
      throw new HarnessError(
        'invalid_argument',
        `resolutions[${index}].as must be plan, out-of-scope or ask`
      )
    }
    if (resolution.as !== 'plan' && !hasText(resolution.reason)) {
      throw new HarnessError(
        'invalid_argument',
        `resolutions[${index}]: ${resolution.as} needs a reason`
      )
    }
    request.resolution = {
      as: resolution.as,
      items: textList(resolution.items),
      reason: hasText(resolution.reason) ? resolution.reason.trim() : null,
      costGpuHours: typeof resolution.costGpuHours === 'number' ? resolution.costGpuHours : null,
      by: 'agent'
    }
    if (
      resolution.as === 'out-of-scope' &&
      !outOfScope.some((entry) => entry.from === request.id)
    ) {
      outOfScope.push({
        item: request.request,
        reason: request.resolution.reason,
        from: request.id,
        by: 'agent'
      })
    }
  }
  return updatePlan(
    project,
    planId,
    {
      premortem: { ...plan.premortem, requests },
      scope: { ...(isObject(plan.scope) ? plan.scope : {}), outOfScope }
    },
    { merge: true }
  )
}
