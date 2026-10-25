import { realpath } from 'node:fs/promises'
import path from 'node:path'
import { agentIdentityFromEnvironment } from './research-agent-identity.mjs'
import { sha256OfFile, withFileLock } from './research-file-transactions.mjs'
import { HarnessError } from './research-harness-error.mjs'
import {
  appendLedgerEntry,
  existingExperiment,
  readLedgerEntries
} from './research-jsonl-ledger.mjs'
import { experimentPaths, experimentRelativePath } from './research-layout.mjs'
import { projectFile, projectRelative } from './research-manuscript-numbers.mjs'
import { resolveRunReference } from './research-run-manifest.mjs'
import { readRunOutputSampleIds, runOutputsPath } from './research-run-outputs.mjs'

export const SINGLE_VERDICTS = ['good', 'bad', 'unsure']
export const PAIRWISE_VERDICTS = ['a', 'b', 'tie']
const RATERS = ['user', 'agent']
const TAG = /^[a-z0-9][a-z0-9-]{0,39}$/u
const SHA256 = /^[a-f0-9]{64}$/u
const MAX_TAGS = 8
const MAX_NOTE_LENGTH = 2000
const MAX_SAMPLE_ID_LENGTH = 256
const MAX_JUDGE_TEXT_LENGTH = 200

function ratingsLedger(project, slug) {
  return {
    file: path.join(experimentPaths(project, slug).experiment, 'ratings.jsonl'),
    relative: `${experimentRelativePath(project, slug)}/ratings.jsonl`
  }
}

function storedRating(entry) {
  if (
    entry?.schemaVersion !== 1 ||
    typeof entry.id !== 'string' ||
    typeof entry.sampleId !== 'string' ||
    typeof entry.run !== 'string' ||
    !RATERS.includes(entry.by)
  ) {
    return null
  }
  if (entry.mode === 'single') {
    return SINGLE_VERDICTS.includes(entry.verdict) ? entry : null
  }
  if (entry.mode === 'pairwise') {
    return PAIRWISE_VERDICTS.includes(entry.verdict) &&
      typeof entry.against === 'string' &&
      entry.against !== entry.run
      ? entry
      : null
  }
  return null
}

function ratingKey(rating) {
  const pair = rating.mode === 'single' ? [rating.run] : [rating.run, rating.against].sort()
  return JSON.stringify([rating.by, rating.sampleId, rating.mode, ...pair])
}

/** The valid judgments in file order; a later one replaces an earlier one with the same key. */
function latestRatings(entries) {
  const latest = new Map()
  for (const entry of entries) {
    const rating = storedRating(entry)
    if (rating) {
      const key = ratingKey(rating)
      latest.delete(key)
      latest.set(key, rating)
    }
  }
  return [...latest.values()]
}

const flippedVerdicts = { a: 'b', b: 'a', tie: 'tie' }

/** Presents a pairwise judgment from `run`'s side, swapping a and b when it was stored reversed. */
function fromSideOf(rating, run) {
  if (rating.mode !== 'pairwise' || rating.run === run || rating.against !== run) {
    return rating
  }
  return {
    ...rating,
    run: rating.against,
    against: rating.run,
    verdict: flippedVerdicts[rating.verdict]
  }
}

function nextRatingId(entries) {
  let highest = 0
  for (const entry of entries) {
    const match = /^rating-(\d+)$/u.exec(entry?.id ?? '')
    highest = Math.max(highest, match ? Number(match[1]) : 0)
  }
  return `rating-${highest + 1}`
}

function checkedRater(by) {
  if (by !== null && by !== undefined && !RATERS.includes(by)) {
    throw new HarnessError('invalid_argument', '--by must be user or agent')
  }
  return by ?? null
}

function checkedText(value, label, maxLength) {
  if (value === undefined || value === null) {
    return null
  }
  const text = String(value).trim()
  if (text.length > maxLength || /[\r\n\0]/u.test(text)) {
    throw new HarnessError(
      'invalid_argument',
      `${label} must be one line of at most ${maxLength} characters`
    )
  }
  return text || null
}

function checkedSampleId(value) {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > MAX_SAMPLE_ID_LENGTH ||
    /[\r\n\0]/u.test(value)
  ) {
    throw new HarnessError(
      'invalid_argument',
      `Sample ID must be one nonempty line of at most ${MAX_SAMPLE_ID_LENGTH} characters`
    )
  }
  return value
}

function checkedTags(values) {
  const tags = [...new Set((values ?? []).map((value) => String(value).trim().toLowerCase()))]
  if (tags.length > MAX_TAGS) {
    throw new HarnessError('invalid_argument', `A rating takes at most ${MAX_TAGS} tags`)
  }
  for (const tag of tags) {
    if (!TAG.test(tag)) {
      throw new HarnessError(
        'invalid_argument',
        `Tags must be 1–40 lowercase letters, digits, or hyphens: ${tag}`
      )
    }
  }
  return tags
}

function checkedNote(value) {
  const note = value === undefined || value === null ? '' : String(value).trim()
  if (note.length > MAX_NOTE_LENGTH) {
    throw new HarnessError('invalid_argument', `Note must be at most ${MAX_NOTE_LENGTH} characters`)
  }
  return note || null
}

async function rubricReference(project, rubricPath) {
  if (!rubricPath) {
    return null
  }
  const file = await projectFile(project, rubricPath).catch((error) => {
    throw new HarnessError(
      error?.code === 'ENOENT' ? 'not_found' : 'invalid_argument',
      `Rubric must be a file of at most 10 MiB inside the project: ${rubricPath}`
    )
  })
  return { path: projectRelative(project, file), sha256: await sha256OfFile(file) }
}

function judgeOf(input, by, identity) {
  const model = checkedText(input.judgeModel, '--judge-model', MAX_JUDGE_TEXT_LENGTH)
  const provider = checkedText(input.judgeProvider, '--judge-provider', MAX_JUDGE_TEXT_LENGTH)
  const promptSha256 = checkedText(input.judgePromptSha, '--judge-prompt-sha', 64)?.toLowerCase()
  if (by === 'user') {
    if (model || provider || promptSha256) {
      throw new HarnessError('usage', 'Judge options only apply to --by agent ratings')
    }
    return null
  }
  if (!model) {
    throw new HarnessError('missing_judge', 'An agent rating needs --judge-model <model ID>')
  }
  if (promptSha256 && !SHA256.test(promptSha256)) {
    throw new HarnessError('invalid_argument', '--judge-prompt-sha must be a 64-digit hex SHA-256')
  }
  return {
    provider: provider ?? identity?.provider ?? null,
    model,
    promptSha256: promptSha256 ?? null
  }
}

async function requireSample(project, resolved, sampleId) {
  const ids = await readRunOutputSampleIds(resolved.paths.run)
  if (ids && !ids.has(sampleId)) {
    throw new HarnessError(
      'sample_not_found',
      `Sample ${sampleId} is not in ${projectRelative(project, runOutputsPath(resolved.paths.run))}`
    )
  }
}

/**
 * Appends one sample judgment to the Experiment's ratings.jsonl. `env` decides the agent identity;
 * the app passes an empty one because its own environment says nothing about who clicked.
 */
export async function addRating(projectPath, input, { env = process.env } = {}) {
  const project = await realpath(projectPath)
  const slug = await existingExperiment(project, input.experiment)
  const identity = agentIdentityFromEnvironment(env)
  const by = checkedRater(input.by) ?? (identity?.provider ? 'agent' : 'user')
  if (by === 'user' && identity?.provider) {
    throw new HarnessError(
      'user_rating_from_agent',
      `${identity.provider} is an agent; record its judgment with --by agent --judge-model <model ID>`
    )
  }
  const sampleId = checkedSampleId(input.sampleId)
  const run = await resolveRunReference(project, input.run)
  const against = input.against ? await resolveRunReference(project, input.against) : null
  if (against?.ref === run.ref) {
    throw new HarnessError('invalid_argument', 'A Run cannot be rated against itself')
  }
  if (run.experiment !== slug && against?.experiment !== slug) {
    throw new HarnessError('invalid_argument', `Neither Run belongs to Experiment ${slug}`)
  }
  const mode = against ? 'pairwise' : 'single'
  const verdicts = mode === 'single' ? SINGLE_VERDICTS : PAIRWISE_VERDICTS
  if (!verdicts.includes(input.verdict)) {
    throw new HarnessError(
      'invalid_argument',
      mode === 'single'
        ? `Verdict must be one of: ${SINGLE_VERDICTS.join(', ')} (a, b, and tie need --against)`
        : `With --against the verdict must be one of: ${PAIRWISE_VERDICTS.join(', ')} (a = --run)`
    )
  }
  if (input.blind && mode === 'single') {
    throw new HarnessError('usage', '--blind applies to A/B ratings with --against')
  }
  const tags = checkedTags(input.tags)
  const note = checkedNote(input.note)
  const judge = judgeOf(input, by, identity)
  for (const resolved of against ? [run, against] : [run]) {
    await requireSample(project, resolved, sampleId)
  }
  const rubric = await rubricReference(project, input.rubric)
  const ledger = ratingsLedger(project, slug)
  const rating = await withFileLock(`${ledger.file}.lock`, async () => {
    const entries = await readLedgerEntries(ledger.file)
    const created = {
      schemaVersion: 1,
      id: nextRatingId(entries),
      at: new Date().toISOString(),
      sampleId,
      mode,
      run: run.ref,
      against: against?.ref ?? null,
      verdict: input.verdict,
      tags,
      note,
      by,
      blind: Boolean(input.blind),
      rubric,
      judge,
      ...(identity ? { agent: identity } : {})
    }
    await appendLedgerEntry(ledger.file, created)
    return created
  })
  return { experiment: slug, ledger: ledger.relative, rating }
}

async function optionalRunReference(project, reference) {
  return reference ? (await resolveRunReference(project, reference)).ref : null
}

/**
 * Current judgments: the latest per (by, sample, mode, unordered Run pair). With `run` or `against`,
 * pairwise judgments are shown from that Run's side; with both, only that pair's are listed.
 */
export async function listRatings(
  projectPath,
  { experiment, run = null, against = null, by = null } = {}
) {
  const project = await realpath(projectPath)
  const slug = await existingExperiment(project, experiment)
  const rater = checkedRater(by)
  const runRef = await optionalRunReference(project, run)
  const againstRef = await optionalRunReference(project, against)
  if (runRef && runRef === againstRef) {
    throw new HarnessError('invalid_argument', 'A Run cannot be rated against itself')
  }
  const ledger = ratingsLedger(project, slug)
  const involves = (rating, ref) => rating.run === ref || rating.against === ref
  const ratings = latestRatings(await readLedgerEntries(ledger.file))
    .filter((rating) => rater === null || rating.by === rater)
    .filter((rating) => {
      if (againstRef) {
        return (
          rating.mode === 'pairwise' &&
          involves(rating, againstRef) &&
          (runRef === null || involves(rating, runRef))
        )
      }
      return runRef === null || involves(rating, runRef)
    })
    .map((rating) => {
      if (runRef) {
        return fromSideOf(rating, runRef)
      }
      if (againstRef) {
        const other = rating.run === againstRef ? rating.against : rating.run
        return fromSideOf(rating, other)
      }
      return rating
    })
  return { experiment: slug, ledger: ledger.relative, ratings }
}

function pairwiseCounts(ratings) {
  const count = (verdict) => ratings.filter((rating) => rating.verdict === verdict).length
  return { wins: count('a'), losses: count('b'), ties: count('tie'), n: ratings.length }
}

function singleCounts(ratings) {
  const count = (verdict) => ratings.filter((rating) => rating.verdict === verdict).length
  return { good: count('good'), bad: count('bad'), unsure: count('unsure'), n: ratings.length }
}

function sourceCounts(ratings, hasPair) {
  return {
    pairwise: hasPair
      ? pairwiseCounts(ratings.filter((rating) => rating.mode === 'pairwise'))
      : null,
    single: singleCounts(ratings.filter((rating) => rating.mode === 'single'))
  }
}

/** User and agent verdicts on the same sample and mode; ratings are already from `run`'s side. */
function agreementOf(ratings) {
  const unit = (rating) => `${rating.mode}\u0000${rating.sampleId}`
  const agent = new Map(
    ratings.filter((rating) => rating.by === 'agent').map((rating) => [unit(rating), rating])
  )
  let overlap = 0
  let agreeing = 0
  for (const rating of ratings) {
    const judged = rating.by === 'user' ? agent.get(unit(rating)) : undefined
    if (judged) {
      overlap += 1
      agreeing += judged.verdict === rating.verdict ? 1 : 0
    }
  }
  return { overlap, agreeing, rate: overlap ? agreeing / overlap : null }
}

function judgeGroups(ratings) {
  const groups = new Map()
  for (const rating of ratings) {
    if (rating.by !== 'agent' || !rating.judge?.model) {
      continue
    }
    const group = {
      provider: rating.judge.provider ?? null,
      model: rating.judge.model,
      promptSha256: rating.judge.promptSha256 ?? null,
      rubricSha256: rating.rubric?.sha256 ?? null
    }
    const key = JSON.stringify(Object.values(group))
    const current = groups.get(key) ?? { ...group, n: 0 }
    current.n += 1
    groups.set(key, current)
  }
  return [...groups.values()].sort((left, right) => right.n - left.n)
}

function tagCounts(ratings) {
  const counts = {}
  for (const rating of ratings) {
    for (const tag of Array.isArray(rating.tags) ? rating.tags : []) {
      counts[tag] = (counts[tag] ?? 0) + 1
    }
  }
  return Object.fromEntries(Object.entries(counts).sort((left, right) => right[1] - left[1]))
}

/**
 * Counts for `run`'s single judgments and, with `against`, its A/B judgments against that Run.
 * People and agent judges are counted separately as well as together.
 */
export async function summarizeRatings(projectPath, { experiment, run, against = null } = {}) {
  if (!run) {
    throw new HarnessError('usage', 'A summary needs --run <experiment>/<run>')
  }
  const listed = await listRatings(projectPath, { experiment, run })
  const project = await realpath(projectPath)
  const runRef = await optionalRunReference(project, run)
  const againstRef = await optionalRunReference(project, against)
  if (runRef === againstRef) {
    throw new HarnessError('invalid_argument', 'A Run cannot be rated against itself')
  }
  const scoped = listed.ratings.filter((rating) =>
    rating.mode === 'single' ? rating.run === runRef : rating.against === againstRef
  )
  const judges = judgeGroups(scoped)
  const hasPair = againstRef !== null
  return {
    experiment: listed.experiment,
    run: runRef,
    against: againstRef,
    ...sourceCounts(scoped, hasPair),
    bySource: {
      user: sourceCounts(
        scoped.filter((rating) => rating.by === 'user'),
        hasPair
      ),
      agent: sourceCounts(
        scoped.filter((rating) => rating.by === 'agent'),
        hasPair
      )
    },
    agreement: agreementOf(scoped),
    judges,
    judgeMixed: judges.length > 1,
    tags: tagCounts(scoped)
  }
}
