import {
  integer,
  invalid,
  isObject,
  list,
  nullableText,
  oneOf,
  text,
  uniqueIds
} from './research-rebuttal-fields.mjs'
import { REBUTTAL_SCHEMA_VERSION, safeReviewerId } from './research-rebuttal-model.mjs'

// Why no node imports: the app parses and writes the same files in the renderer.
export const REPLY_AUTHORS = ['human', 'agent', 'both']
export const PREDICTION_LIKELIHOODS = ['low', 'medium', 'high']
export const PREDICTION_STATUSES = ['open', 'dismissed', 'converted', 'handed-off']
export const OUTLOOK_DIRECTIONS = ['up', 'same', 'down']
export const PAPER_CHANGE_STATUSES = ['pending', 'applied', 'rejected']
export const FOLLOW_UP_SOURCES = ['paste', 'openreview']
export const MAX_REPLY_CHARS = 30_000
export const MAX_FOLLOW_UP_CHARS = 200_000
const REVIEWER_COLLATOR = new Intl.Collator('en', { numeric: true })
const MAX_PROPOSALS = 120
const MAX_VERSIONS_PER_REPLY = 40
const SLOT = /^(?:C[1-9][0-9]{0,2}|opening:R[1-9][0-9]?|general:(?:intro|closing))$/
const PREDICTION_ID = /^R[1-9][0-9]?-N[1-9][0-9]{0,2}$/
const PROPOSAL_ID = /^X[1-9][0-9]{0,4}$/
const VERSION_ID = /^V[1-9][0-9]{0,4}$/
const PAPER_CHANGE_ID = /^E[1-9][0-9]{0,3}$/
const CLUSTER_REFERENCE = /^C[1-9][0-9]{0,2}$/

/** Where a reply's text lives: a cluster's answer, a reviewer's opening, or the general intro/closing. */
export function safeSlot(value) {
  if (typeof value !== 'string' || !SLOT.test(value)) {
    throw invalid(
      `A reply target must look like C3, opening:R1 or general:intro, got: ${String(value)}`
    )
  }
  return value
}

export function slotFor({ cluster, opening, general }) {
  if (cluster) {
    return cluster
  }
  return opening ? `opening:${safeReviewerId(opening)}` : `general:${general}`
}

/** The history file of a reply, e.g. C3 → C3.json, opening:R1 → opening-R1.json. */
export function historyFileName(slot) {
  return `${safeSlot(slot).replace(':', '-')}.json`
}

export function slotText(bundle, slot) {
  if (slot.startsWith('opening:')) {
    return bundle.meta.reviewers.find((r) => r.id === slot.slice(8))?.opening ?? null
  }
  if (slot.startsWith('general:')) {
    return slot === 'general:closing' ? bundle.meta.general.closing : bundle.meta.general.intro
  }
  return bundle.clusters.find((cluster) => cluster.id === slot)?.response ?? null
}

function requiredObject(entry, label) {
  if (!isObject(entry)) {
    throw invalid(`${label} must be an object`)
  }
  return entry
}

/** FNV-1a over the reply with whitespace runs collapsed, so a reflow does not mark it changed. */
export function replyHash(value) {
  const flat = String(value ?? '')
    .replace(/\s+/gu, ' ')
    .trim()
  let hash = 0x811c9dc5
  for (let index = 0; index < flat.length; index += 1) {
    hash ^= flat.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

// -- Follow-up rounds ---------------------------------------------------------------------------

/** A reviewer's later reply during discussion; round 2 is the first follow-up. */
export function parseFollowUps(value, { reviewers }) {
  const known = new Set(reviewers.map((reviewer) => reviewer.id))
  const followUps = list(value, 'followUps', 'followUps').map((entry, index) => {
    requiredObject(entry, `followUps[${index}]`)
    const reviewer = safeReviewerId(entry.reviewer)
    if (!known.has(reviewer)) {
      throw invalid(`A follow-up names reviewer ${reviewer}, who has no review here`)
    }
    if (!Number.isInteger(entry.round)) {
      throw invalid(`${reviewer} follow-up needs a round number`)
    }
    return {
      ...entry,
      id: `${reviewer}-round-${entry.round}`,
      reviewer,
      round: integer(entry.round, `${reviewer} follow-up round`, { min: 2, max: 20 }),
      text: text(entry.text, `${reviewer} follow-up text`, {
        max: MAX_FOLLOW_UP_CHARS,
        required: true
      }),
      receivedAt: text(entry.receivedAt, `${reviewer} follow-up receivedAt`, { max: 64 }),
      source: oneOf(entry.source, `${reviewer} follow-up source`, FOLLOW_UP_SOURCES, 'paste'),
      noteId: nullableText(entry.noteId, `${reviewer} follow-up noteId`, 200)
    }
  })
  uniqueIds(followUps, 'follow-up')
  return followUps.sort(
    (left, right) =>
      REVIEWER_COLLATOR.compare(left.reviewer, right.reviewer) || left.round - right.round
  )
}

export function nextFollowUpRound(followUps, reviewerId) {
  return (
    followUps
      .filter((followUp) => followUp.reviewer === reviewerId)
      .reduce((max, followUp) => Math.max(max, followUp.round), 1) + 1
  )
}

export function followUpsDocument(followUps) {
  return { schemaVersion: REBUTTAL_SCHEMA_VERSION, followUps }
}

// -- Agent proposals -----------------------------------------------------------------------------

function parseProposal(entry, index) {
  requiredObject(entry, `proposals[${index}]`)
  if (typeof entry.id !== 'string' || !PROPOSAL_ID.test(entry.id)) {
    throw invalid(`Proposal ID must look like X1, got: ${String(entry.id)}`)
  }
  const passage = entry.find !== undefined && entry.find !== null
  return {
    ...entry,
    id: entry.id,
    slot: safeSlot(entry.slot),
    kind: passage ? 'passage' : 'replace',
    applied: entry.applied === true,
    base: text(entry.base, `${entry.id} base`, { max: MAX_REPLY_CHARS }),
    text: text(entry.text, `${entry.id} text`, { max: MAX_REPLY_CHARS, required: true }),
    find: passage
      ? text(entry.find, `${entry.id} find`, { max: MAX_REPLY_CHARS, required: true })
      : null,
    replace: passage ? text(entry.replace, `${entry.id} replace`, { max: MAX_REPLY_CHARS }) : null,
    turn: nullableText(entry.turn, `${entry.id} turn`, 64),
    request: text(entry.request, `${entry.id} request`, { max: 400 }),
    at: text(entry.at, `${entry.id} at`, { max: 64 })
  }
}

export function parseProposals(value) {
  const proposals = list(value, 'proposals', 'proposals').map(parseProposal)
  uniqueIds(proposals, 'proposal')
  return proposals
}

export function proposalsDocument(proposals) {
  return { schemaVersion: REBUTTAL_SCHEMA_VERSION, proposals }
}

function nextNumberedId(prefix, items) {
  const highest = items.reduce((max, item) => Math.max(max, Number(item.id.slice(1)) || 0), 0)
  return `${prefix}${highest + 1}`
}

/** Adds a proposal, dropping any earlier one for the same reply (returned so it can be kept). */
export function withProposal(proposals, proposal) {
  const superseded = proposals.filter((entry) => entry.slot === proposal.slot)
  const kept = proposals.filter((entry) => entry.slot !== proposal.slot)
  const next = {
    ...proposal,
    id: nextNumberedId('X', proposals),
    base: proposal.base ?? '',
    text: proposal.text,
    find: proposal.find ?? null,
    replace: proposal.replace ?? null,
    turn: proposal.turn ?? null,
    request: proposal.request ?? ''
  }
  return { proposals: [...kept.slice(-MAX_PROPOSALS + 1), next], superseded }
}

/**
 * What accepting a proposal gives, against the reply as it is now: `mode` is `clean` when the
 * reply is untouched or a passage still stands, `overwrites` when a whole-reply proposal would
 * replace later human edits, and `conflict` when a passage cannot be found any more.
 */
export function proposalOutcome(current, proposal) {
  if (current === proposal.text) {
    return { mode: 'clean', text: proposal.text }
  }
  if (current === proposal.base) {
    return { mode: 'clean', text: proposal.text }
  }
  if (proposal.kind === 'passage') {
    const first = current.indexOf(proposal.find)
    return first === -1 || first !== current.lastIndexOf(proposal.find)
      ? { mode: 'conflict', text: null }
      : {
          mode: 'clean',
          text: `${current.slice(0, first)}${proposal.replace}${current.slice(first + proposal.find.length)}`
        }
  }
  return { mode: 'overwrites', text: proposal.text }
}

export function replyAuthorAfterAccept(previous) {
  return previous === 'human' || previous === 'both' ? 'both' : 'agent'
}

/** Who wrote a reply after the person saves `next` over `previous`. */
export function replyAuthorAfterHumanEdit(author, previousText, nextText) {
  if (!nextText.trim()) {
    return null
  }
  if (!previousText.trim() || author === null) {
    return 'human'
  }
  return previousText === nextText ? author : author === 'human' ? 'human' : 'both'
}

// -- Reply versions ------------------------------------------------------------------------------

export function parseHistory(value) {
  const versions = list(value, 'versions', 'versions').map((entry, index) => {
    requiredObject(entry, `versions[${index}]`)
    if (typeof entry.id !== 'string' || !VERSION_ID.test(entry.id)) {
      throw invalid(`Version ID must look like V1, got: ${String(entry.id)}`)
    }
    return {
      id: entry.id,
      at: text(entry.at, `${entry.id} at`, { max: 64 }),
      by: oneOf(entry.by, `${entry.id} by`, ['human', 'agent']),
      what: text(entry.what, `${entry.id} what`, { max: 200, fallback: '' }),
      text: text(entry.text, `${entry.id} text`, { max: MAX_REPLY_CHARS }),
      turn: nullableText(entry.turn, `${entry.id} turn`, 64)
    }
  })
  uniqueIds(versions, 'version')
  return versions
}

/** Newest last; a reply keeps at most its last 40 versions. */
export function appendVersion(versions, entry) {
  const previous = versions.at(-1)
  if (previous && previous.text === entry.text && previous.by === entry.by) {
    return versions
  }
  const next = { ...entry, id: nextNumberedId('V', versions), turn: entry.turn ?? null }
  return [...versions, next].slice(-MAX_VERSIONS_PER_REPLY)
}

export function historyDocument(versions) {
  return { schemaVersion: REBUTTAL_SCHEMA_VERSION, versions }
}

// -- Next-concern predictions -------------------------------------------------------------------

function parseTrigger(value, label, clusterIds) {
  if (value === undefined || value === null) {
    return { cluster: null, point: null, quote: null }
  }
  requiredObject(value, label)
  const cluster = nullableText(value.cluster, `${label}.cluster`, 16)
  if (cluster && clusterIds && !clusterIds.has(cluster)) {
    throw invalid(`${label}: unknown cluster ${cluster}`)
  }
  return {
    cluster,
    point: nullableText(value.point, `${label}.point`, 24),
    quote: nullableText(value.quote, `${label}.quote`, 1000)
  }
}

function parsePrediction(entry, index, known, clusterIds) {
  requiredObject(entry, `predictions[${index}]`)
  if (typeof entry.id !== 'string' || !PREDICTION_ID.test(entry.id)) {
    throw invalid(`Prediction ID must look like R1-N2, got: ${String(entry.id)}`)
  }
  const reviewer = safeReviewerId(entry.reviewer)
  if (known && !known.has(reviewer)) {
    throw invalid(`${entry.id}: unknown reviewer ${reviewer}`)
  }
  return {
    ...entry,
    id: entry.id,
    reviewer,
    concern: text(entry.concern, `${entry.id} concern`, { max: 800, required: true }),
    why: text(entry.why, `${entry.id} why`, { max: 2000, required: true }),
    likelihood: oneOf(entry.likelihood, `${entry.id} likelihood`, PREDICTION_LIKELIHOODS),
    trigger: parseTrigger(entry.trigger, `${entry.id} trigger`, clusterIds),
    preempt: text(entry.preempt, `${entry.id} preempt`, { max: 2000, required: true }),
    status: oneOf(entry.status, `${entry.id} status`, PREDICTION_STATUSES, 'open'),
    basis: text(entry.basis, `${entry.id} basis`, { max: 64 }),
    predictedAt: text(entry.predictedAt, `${entry.id} predictedAt`, { max: 64 }),
    convertedTo: nullableText(entry.convertedTo, `${entry.id} convertedTo`, 24)
  }
}

function parseOutlook(entry, index, known) {
  requiredObject(entry, `outlooks[${index}]`)
  const reviewer = safeReviewerId(entry.reviewer)
  if (known && !known.has(reviewer)) {
    throw invalid(`Outlook: unknown reviewer ${reviewer}`)
  }
  return {
    reviewer,
    direction: oneOf(entry.direction, `${reviewer} outlook direction`, OUTLOOK_DIRECTIONS),
    note: text(entry.note, `${reviewer} outlook note`, { max: 600, required: true }),
    basis: text(entry.basis, `${reviewer} outlook basis`, { max: 64 }),
    at: text(entry.at, `${reviewer} outlook at`, { max: 64 })
  }
}

/** Everything a reviewer agent predicted, plus each reviewer's latest outlook guess. */
export function parsePredictions(value, { reviewers, clusterIds } = {}) {
  const document = isObject(value) ? value : { predictions: value ?? [], outlooks: [] }
  const known = reviewers ? new Set(reviewers.map((reviewer) => reviewer.id)) : null
  const clusters = clusterIds ? new Set(clusterIds) : null
  const predictions = list(document, 'predictions', 'predictions').map((entry, index) =>
    parsePrediction(entry, index, known, clusters)
  )
  uniqueIds(predictions, 'prediction')
  const outlooks = (Array.isArray(document.outlooks) ? document.outlooks : []).map((entry, index) =>
    parseOutlook(entry, index, known)
  )
  return { predictions, outlooks }
}

export function predictionsDocument({ predictions, outlooks }) {
  return { schemaVersion: REBUTTAL_SCHEMA_VERSION, predictions, outlooks }
}

/** The text of every reply a reviewer gets, in cluster order, for the prediction basis. */
function reviewerRepliesText(bundle, reviewerId) {
  const ownPoints = new Set(
    bundle.points.filter((point) => point.reviewer === reviewerId).map((point) => point.id)
  )
  return bundle.clusters
    .filter((cluster) => cluster.points.some((id) => ownPoints.has(id)))
    .map((cluster) => cluster.response)
    .join('\n')
}

/** The hash a prediction is checked against: its triggering reply, or all of the reviewer's. */
export function predictionBasis(bundle, prediction) {
  const clusterId = prediction.trigger?.cluster
  if (clusterId) {
    const cluster = bundle.clusters.find((entry) => entry.id === clusterId)
    return cluster ? replyHash(cluster.response) : 'missing'
  }
  return replyHash(reviewerRepliesText(bundle, prediction.reviewer))
}

export function predictionIsStale(bundle, prediction) {
  return (
    (prediction.status === 'open' || prediction.status === 'handed-off') &&
    predictionBasis(bundle, prediction) !== prediction.basis
  )
}

export function reviewerRepliesBasis(bundle, reviewerId) {
  return replyHash(reviewerRepliesText(bundle, reviewerId))
}

/** Replaces a reviewer's open predictions with a new batch; decided ones stay on record. */
export function withReviewerPredictions(document, reviewerId, incoming, outlook, { basis, now }) {
  const others = document.predictions.filter(
    (entry) => entry.reviewer !== reviewerId || entry.status !== 'open'
  )
  const taken = new Set(others.map((entry) => entry.id))
  let number = others
    .filter((entry) => entry.reviewer === reviewerId)
    .reduce((max, entry) => Math.max(max, Number(entry.id.split('-N')[1]) || 0), 0)
  const fresh = incoming.map((entry, index) => {
    requiredObject(entry, `predictions[${index}]`)
    if (entry.status && entry.status !== 'open') {
      throw invalid('New predictions must be open; the person decides them in Aster.')
    }
    let id = entry.id
    if (typeof id !== 'string' || taken.has(id)) {
      number += 1
      id = `${reviewerId}-N${number}`
    }
    taken.add(id)
    return { ...entry, id, reviewer: reviewerId, status: 'open', predictedAt: now, basis: '' }
  })
  const outlooks = [
    ...document.outlooks.filter((entry) => entry.reviewer !== reviewerId),
    ...(outlook ? [{ ...outlook, reviewer: reviewerId, at: now, basis }] : [])
  ]
  return { predictions: [...others, ...fresh], outlooks, freshIds: fresh.map((entry) => entry.id) }
}

// -- Tracked manuscript changes ------------------------------------------------------------------

function safeManuscriptPath(value, label) {
  const file = text(value, label, { max: 1024, required: true })
  if (file.startsWith('/') || /^[A-Za-z]:/.test(file) || file.split(/[\\/]/).includes('..')) {
    throw invalid(`${label} must be a project-relative path`)
  }
  return file
}

export function parsePaperChanges(value, { clusterIds } = {}) {
  const known = clusterIds ? new Set(clusterIds) : null
  const changes = list(value, 'changes', 'changes').map((entry, index) => {
    requiredObject(entry, `changes[${index}]`)
    if (typeof entry.id !== 'string' || !PAPER_CHANGE_ID.test(entry.id)) {
      throw invalid(`Paper change ID must look like E1, got: ${String(entry.id)}`)
    }
    const cluster = text(entry.cluster, `${entry.id} cluster`, { max: 16, required: true })
    if (!CLUSTER_REFERENCE.test(cluster)) {
      throw invalid(`${entry.id}: cluster must look like C1`)
    }
    if (known && !known.has(cluster)) {
      throw invalid(`${entry.id}: unknown cluster ${cluster}`)
    }
    return {
      ...entry,
      id: entry.id,
      cluster,
      promise: nullableText(entry.promise, `${entry.id} promise`, 16),
      file: safeManuscriptPath(entry.file, `${entry.id} file`),
      find: text(entry.find, `${entry.id} find`, { max: MAX_REPLY_CHARS, required: true }),
      replace: text(entry.replace, `${entry.id} replace`, { max: MAX_REPLY_CHARS }),
      why: text(entry.why, `${entry.id} why`, { max: 2000, required: true }),
      status: oneOf(entry.status, `${entry.id} status`, PAPER_CHANGE_STATUSES, 'pending'),
      at: text(entry.at, `${entry.id} at`, { max: 64 }),
      decidedAt: nullableText(entry.decidedAt, `${entry.id} decidedAt`, 64)
    }
  })
  uniqueIds(changes, 'paper change')
  return changes
}

export function paperChangesDocument(changes) {
  return { schemaVersion: REBUTTAL_SCHEMA_VERSION, changes }
}

/** Where `find` sits in the manuscript, or why it cannot be applied safely. */
export function locatePaperChange(source, find) {
  const first = source.indexOf(find)
  if (first === -1) {
    return { error: 'The passage is no longer in the file.' }
  }
  if (first !== source.lastIndexOf(find)) {
    return { error: 'The passage appears more than once in the file.' }
  }
  return { start: first, end: first + find.length }
}

export function nextPaperChangeId(changes) {
  return nextNumberedId('E', changes)
}
