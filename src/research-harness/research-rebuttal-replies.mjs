import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { writeJsonAtomically } from './research-file-transactions.mjs'
import { HarnessError } from './research-harness-error.mjs'
import { loadRebuttal, readJsonIfPresent, updateRebuttal } from './research-rebuttal-files.mjs'
import {
  appendVersion,
  historyDocument,
  historyFileName,
  locatePaperChange,
  nextFollowUpRound,
  nextPaperChangeId,
  parseFollowUps,
  parseHistory,
  parsePaperChanges,
  parsePredictions,
  paperChangesDocument,
  predictionBasis,
  predictionIsStale,
  predictionsDocument,
  proposalsDocument,
  replyAuthorAfterAccept,
  reviewerRepliesBasis,
  safeSlot,
  slotFor,
  slotText,
  withProposal,
  withReviewerPredictions,
  followUpsDocument
} from './research-rebuttal-records.mjs'
import {
  clustersDocument,
  nextSequentialId,
  parseRebuttalMeta,
  promisesDocument,
  safeReviewerId
} from './research-rebuttal-model.mjs'
import { parseClusters, parsePromises } from './research-rebuttal-points.mjs'
import {
  planReviewerReplies,
  reviewerDisplayName,
  sharedClusters
} from './research-rebuttal-assemble.mjs'

async function pushVersion(files, slot, version) {
  await mkdir(files.history, { recursive: true })
  const target = path.join(files.history, historyFileName(slot))
  const versions = parseHistory((await readJsonIfPresent(target)) ?? [])
  await writeJsonAtomically(target, historyDocument(appendVersion(versions, version)))
}

function requireSlot(input) {
  const targets = [input.cluster, input.opening, input.general].filter(Boolean)
  if (targets.length !== 1) {
    throw new HarnessError(
      'usage',
      'Pass exactly one of --cluster ID, --opening REVIEWER, --general intro|closing'
    )
  }
  if (input.general && input.general !== 'intro' && input.general !== 'closing') {
    throw new HarnessError('usage', '--general takes intro or closing')
  }
  return slotFor(input)
}

async function writeSlot(bundle, slot, text, { author, status }) {
  if (slot.startsWith('C')) {
    const clusters = parseClusters(
      bundle.clusters.map((entry) =>
        entry.id === slot
          ? {
              ...entry,
              response: text,
              author,
              status: status ?? (entry.status === 'todo' ? 'drafting' : entry.status)
            }
          : entry
      ),
      { pointIds: bundle.points.map((point) => point.id) }
    )
    await writeJsonAtomically(bundle.files.clusters, clustersDocument(clusters))
    return clusters.find((entry) => entry.id === slot) ?? null
  }
  const meta = parseRebuttalMeta(
    slot.startsWith('opening:')
      ? {
          ...bundle.meta,
          reviewers: bundle.meta.reviewers.map((reviewer) =>
            reviewer.id === slot.slice(8) ? { ...reviewer, opening: text } : reviewer
          )
        }
      : {
          ...bundle.meta,
          general: { ...bundle.meta.general, [slot.slice(8)]: text }
        }
  )
  await writeJsonAtomically(bundle.files.meta, { ...meta, updatedAt: new Date().toISOString() })
  return null
}

function currentSlotText(bundle, slot) {
  const current = slotText(bundle, slot)
  if (current === null) {
    throw new HarnessError('not_found', `No reply target ${slot}.`)
  }
  return current
}

function requireWritable(status) {
  if (status === 'done') {
    throw new HarnessError('usage', 'Only the person marks a reply Ready, in Aster.')
  }
}

async function saveProposal(bundle, proposalInput) {
  const { proposals, superseded } = withProposal(bundle.proposals, proposalInput)
  await writeJsonAtomically(bundle.files.proposals, proposalsDocument(proposals))
  for (const entry of superseded.filter((candidate) => !candidate.applied)) {
    await pushVersion(bundle.files, entry.slot, {
      at: proposalInput.at,
      by: 'agent',
      what: 'Replaced by a newer suggestion',
      text: entry.text,
      turn: entry.turn
    })
  }
  return proposals.at(-1)
}

function slotAuthorOf(bundle, slot) {
  return bundle.clusters.find((cluster) => cluster.id === slot)?.author ?? null
}

/** Whether agent text goes straight into a reply: always into an empty one, else per the setting. */
function agentTextLands(bundle, current) {
  return !current.trim() || bundle.meta.agentEdits !== 'ask'
}

/**
 * Puts agent text into a reply. Written text is kept as a version first, and the applied record
 * holds the text to go back to: for edits the person has not touched since, the text before the
 * first of them, so one Undo returns to what they last had.
 */
async function applyAgentText(bundle, slot, input) {
  const { current, next, at, status, turn, request, passage } = input
  const author = slotAuthorOf(bundle, slot)
  const edited = Boolean(current.trim())
  if (edited) {
    await pushVersion(bundle.files, slot, {
      at,
      by: author === 'agent' ? 'agent' : 'human',
      what: 'Before the agent edit',
      text: current,
      turn: null
    })
  }
  const cluster = await writeSlot(bundle, slot, next, {
    author: edited ? replyAuthorAfterAccept(author) : 'agent',
    status
  })
  const untouched = bundle.proposals.find(
    (entry) => entry.slot === slot && entry.applied && entry.text === current
  )
  const proposal = await saveProposal(bundle, {
    slot,
    turn,
    request,
    at,
    applied: true,
    base: untouched ? untouched.base : current,
    text: next,
    ...passage
  })
  await pushVersion(bundle.files, slot, {
    at,
    by: 'agent',
    what: edited ? `Agent edit${request ? `: ${request}` : ''}`.slice(0, 200) : 'Agent draft',
    text: next,
    turn
  })
  return {
    slot,
    applied: true,
    edited,
    proposal: proposal.id,
    updated: slot,
    ...(cluster ? { cluster } : {})
  }
}

async function holdAgentText(bundle, slot, { current, next, at, turn, request, passage }) {
  const proposal = await saveProposal(bundle, {
    slot,
    turn,
    request,
    at,
    applied: false,
    base: current,
    text: next,
    ...passage
  })
  return { slot, applied: false, proposal: proposal.id, updated: slot, pendingProposal: true }
}

/**
 * Agent write of one reply. It lands in the reply (the earlier text kept as a version and undoable
 * in Aster), unless the reply has text and the rebuttal is set to Ask first: then it waits as a
 * proposal the person accepts or discards.
 */
export function setResponse(project, slug, input) {
  const slot = requireSlot(input)
  requireWritable(input.status)
  const next = String(input.text ?? '').trim()
  if (!next) {
    throw new HarnessError('invalid_argument', 'The response text is empty.')
  }
  return updateRebuttal(project, slug, async (bundle) => {
    const current = currentSlotText(bundle, slot)
    if (current.trim() === next) {
      return { slot, unchanged: true, updated: slot }
    }
    const write = {
      current,
      next,
      at: new Date().toISOString(),
      status: input.status,
      turn: input.turn,
      request: input.request
    }
    return agentTextLands(bundle, current)
      ? applyAgentText(bundle, slot, write)
      : holdAgentText(bundle, slot, write)
  })
}

/** Replaces an exact passage of a reply, applied or held the same way as `setResponse`. */
export function reviseResponse(project, slug, input) {
  const slot = requireSlot(input)
  if (typeof input.find !== 'string' || !input.find || typeof input.replace !== 'string') {
    throw new HarnessError('invalid_argument', 'revise needs JSON {"find":"…","replace":"…"}')
  }
  return updateRebuttal(project, slug, async (bundle) => {
    const current = currentSlotText(bundle, slot)
    const first = current.indexOf(input.find)
    if (first === -1 || first !== current.lastIndexOf(input.find)) {
      throw new HarnessError(
        'conflict',
        `The passage ${first === -1 ? 'is not in' : 'appears more than once in'} ${slot}. Read the reply again with rebuttal show, then retry with the exact current text.`
      )
    }
    const next = `${current.slice(0, first)}${input.replace}${current.slice(first + input.find.length)}`
    if (next === current) {
      return { slot, unchanged: true, updated: slot }
    }
    const write = {
      current,
      next,
      at: new Date().toISOString(),
      turn: input.turn,
      request: input.request,
      passage: { find: input.find, replace: input.replace }
    }
    return agentTextLands(bundle, current)
      ? applyAgentText(bundle, slot, write)
      : holdAgentText(bundle, slot, write)
  })
}

export async function listProposals(project, slug) {
  const { proposals } = await loadRebuttal(project, slug)
  return { proposals }
}

export function addFollowUp(project, slug, { reviewer, text, source, noteId }) {
  const id = safeReviewerId(reviewer)
  if (typeof text !== 'string' || !text.trim()) {
    throw new HarnessError('invalid_argument', 'The follow-up text is empty.')
  }
  return updateRebuttal(project, slug, async (bundle) => {
    if (!bundle.meta.reviewers.some((entry) => entry.id === id)) {
      throw new HarnessError('not_found', `No reviewer ${id}.`)
    }
    const round = nextFollowUpRound(bundle.followUps, id)
    const followUps = parseFollowUps(
      [
        ...bundle.followUps,
        { reviewer: id, round, text, receivedAt: new Date().toISOString(), source, noteId }
      ],
      { reviewers: bundle.meta.reviewers }
    )
    await writeJsonAtomically(bundle.files.followUps, followUpsDocument(followUps))
    return { followUp: followUps.find((entry) => entry.reviewer === id && entry.round === round) }
  })
}

function reviewerAnswers(bundle, reviewerId, round) {
  const reply = planReviewerReplies(bundle, { round }).replies.find(
    (entry) => entry.reviewer.id === reviewerId
  )
  return (reply?.answers ?? []).map((answer) => ({
    answer: answer.label,
    round,
    cluster: answer.cluster?.id ?? null,
    title: answer.cluster?.title ?? answer.points[0]?.summary ?? '',
    status: answer.cluster?.status ?? 'todo',
    points: answer.points.map((point) => ({
      id: point.id,
      summary: point.summary,
      quote: point.quote
    })),
    reply: answer.cluster?.response ?? ''
  }))
}

/** What a simulated reviewer reads: their review, follow-ups, and the current replies to them. */
export async function reviewerContext(project, slug, { reviewer }) {
  const id = safeReviewerId(reviewer)
  const bundle = await loadRebuttal(project, slug)
  const entry = bundle.meta.reviewers.find((candidate) => candidate.id === id)
  if (!entry) {
    throw new HarnessError('not_found', `No reviewer ${id}.`)
  }
  const rounds = [
    ...new Set([
      1,
      ...bundle.points.filter((point) => point.reviewer === id).map((point) => point.round)
    ])
  ].sort((left, right) => left - right)
  return {
    reviewer: {
      id,
      name: reviewerDisplayName(entry),
      rating: entry.rating,
      confidence: entry.confidence
    },
    venue: bundle.meta.venue,
    review: bundle.reviews[id] ?? '',
    followUps: bundle.followUps
      .filter((followUp) => followUp.reviewer === id)
      .map(({ round, text, receivedAt }) => ({ round, text, receivedAt })),
    replies: rounds.flatMap((round) => reviewerAnswers(bundle, id, round)),
    // Why: replies often say "see our general response", and a reviewer can read it.
    general: {
      intro: bundle.meta.general.intro,
      closing: bundle.meta.general.closing,
      answers: sharedClusters(bundle)
        .filter(({ cluster }) => cluster.response.trim())
        .map(({ cluster, label }) => ({
          label,
          cluster: cluster.id,
          title: cluster.title,
          reply: cluster.response
        }))
    },
    // Why: in a real discussion a reviewer can read the other reviews and the replies to them.
    otherThreads: bundle.meta.reviewers
      .filter((other) => other.id !== id)
      .map((other) => ({
        reviewer: other.id,
        name: reviewerDisplayName(other),
        rating: other.rating,
        review: bundle.reviews[other.id] ?? '',
        replies: reviewerAnswers(bundle, other.id, 1)
      })),
    openPredictions: bundle.predictions.filter(
      (prediction) => prediction.reviewer === id && prediction.status === 'open'
    ),
    outlook: bundle.outlooks.find((entry) => entry.reviewer === id) ?? null
  }
}

/** Saves a reviewer agent's next-concern predictions: `{predictions:[…], outlook:{…}?}`. */
export function setPredictions(project, slug, { reviewer, input }) {
  const id = safeReviewerId(reviewer)
  const items = Array.isArray(input) ? input : input?.predictions
  if (!Array.isArray(items)) {
    throw new HarnessError(
      'invalid_argument',
      'Predictions must be {"predictions":[…],"outlook":{…}} or a JSON array'
    )
  }
  return updateRebuttal(project, slug, async (bundle) => {
    if (!bundle.meta.reviewers.some((entry) => entry.id === id)) {
      throw new HarnessError('not_found', `No reviewer ${id}.`)
    }
    const now = new Date().toISOString()
    const outlook = Array.isArray(input) ? null : (input?.outlook ?? null)
    const basis = reviewerRepliesBasis(bundle, id)
    const merged = withReviewerPredictions(
      { predictions: bundle.predictions, outlooks: bundle.outlooks },
      id,
      items,
      outlook,
      { basis, now }
    )
    const parsed = parsePredictions(
      {
        predictions: merged.predictions,
        outlooks: merged.outlooks
      },
      { reviewers: bundle.meta.reviewers, clusterIds: bundle.clusters.map((cluster) => cluster.id) }
    )
    const fresh = new Set(merged.freshIds)
    const predictions = parsed.predictions.map((prediction) =>
      fresh.has(prediction.id)
        ? { ...prediction, basis: predictionBasis(bundle, prediction) }
        : prediction
    )
    await writeJsonAtomically(
      bundle.files.predictions,
      predictionsDocument({ predictions, outlooks: parsed.outlooks })
    )
    return {
      predictions: predictions.filter(
        (prediction) => prediction.reviewer === id && prediction.status === 'open'
      ),
      outlook: parsed.outlooks.find((entry) => entry.reviewer === id) ?? null
    }
  })
}

export async function listPredictions(project, slug, { reviewer } = {}) {
  const bundle = await loadRebuttal(project, slug)
  const predictions = bundle.predictions
    .filter((prediction) => !reviewer || prediction.reviewer === reviewer)
    .map((prediction) => ({ ...prediction, stale: predictionIsStale(bundle, prediction) }))
  return { predictions, outlooks: bundle.outlooks }
}

/** Records a manuscript change for a concern; the person approves it in Aster before it is applied. */
export function proposePaperChange(project, slug, { cluster, input }) {
  if (!cluster) {
    throw new HarnessError('usage', '--cluster is required for rebuttal paper propose')
  }
  if (!input || typeof input !== 'object') {
    throw new HarnessError('invalid_argument', 'Expected JSON {"file","find","replace","why"}')
  }
  return updateRebuttal(project, slug, async (bundle) => {
    if (!bundle.clusters.some((entry) => entry.id === cluster)) {
      throw new HarnessError('not_found', `No cluster ${cluster}.`)
    }
    const now = new Date().toISOString()
    let source
    try {
      source = await readFile(path.join(project, String(input.file ?? '')), 'utf8')
    } catch {
      throw new HarnessError('not_found', `No manuscript file ${String(input.file)}.`)
    }
    const located = locatePaperChange(source, String(input.find ?? ''))
    if (located.error) {
      throw new HarnessError(
        'conflict',
        `${located.error} Copy the exact passage from ${input.file}.`
      )
    }
    let promiseId = null
    if (typeof input.promise === 'string' && input.promise.trim()) {
      promiseId = nextSequentialId('P', bundle.promises)
      const promises = parsePromises(
        [
          ...bundle.promises,
          {
            id: promiseId,
            text: input.promise.trim(),
            clusters: [cluster],
            done: false,
            createdAt: now
          }
        ],
        { clusterIds: bundle.clusters.map((entry) => entry.id) }
      )
      await writeJsonAtomically(bundle.files.promises, promisesDocument(promises))
    }
    const change = {
      id: nextPaperChangeId(bundle.paperChanges),
      cluster,
      promise: promiseId,
      file: input.file,
      find: input.find,
      replace: input.replace ?? '',
      why: input.why,
      status: 'pending',
      at: now,
      decidedAt: null
    }
    const changes = parsePaperChanges([...bundle.paperChanges, change], {
      clusterIds: bundle.clusters.map((entry) => entry.id)
    })
    await writeJsonAtomically(bundle.files.paperChanges, paperChangesDocument(changes))
    return { change: changes.find((entry) => entry.id === change.id) }
  })
}

export async function listPaperChanges(project, slug) {
  const { paperChanges } = await loadRebuttal(project, slug)
  return { changes: paperChanges }
}

export async function historyOf(project, slug, slot) {
  const { files } = await loadRebuttal(project, slug)
  const target = path.join(files.history, historyFileName(safeSlot(slot)))
  return { versions: parseHistory((await readJsonIfPresent(target)) ?? []) }
}
