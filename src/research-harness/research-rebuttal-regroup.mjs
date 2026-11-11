import { invalid } from './research-rebuttal-fields.mjs'
import { parseClusters } from './research-rebuttal-points.mjs'
import { replyAuthorAfterAccept } from './research-rebuttal-records.mjs'

// Why no node imports: the app plans the same regroup when it accepts or holds one.
// A regroup changes which concerns a written reply answers: merging, splitting, moving points
// or removing a group. Replies are carried, never lost: a reply whose group goes away moves to
// the group that took its first concern, joined after what is there; a reply with nowhere to go
// is archived. Every replaced text is kept as a version of the group that holds it now.

const JOIN = '\n\n'

export function clusterEntries(input) {
  if (Array.isArray(input)) {
    return input
  }
  return Array.isArray(input?.clusters) ? input.clusters : null
}

/** Reply text the agent sent with `clusters set`, by group ID; blank text counts as none. */
export function suppliedReplies(input) {
  const supplied = new Map()
  for (const entry of clusterEntries(input) ?? []) {
    if (entry && typeof entry === 'object' && typeof entry.response === 'string') {
      const text = entry.response.trim()
      if (text) {
        supplied.set(entry.id, text)
      }
    }
  }
  return supplied
}

function withoutReplies(entries) {
  return entries.map((entry) => {
    if (!entry || typeof entry !== 'object') {
      return entry
    }
    const { response: _response, author: _author, ...rest } = entry
    return rest
  })
}

const written = (cluster) => Boolean(cluster?.response.trim())

function joinedAuthor(sources) {
  const authors = new Set(sources.filter(written).map((source) => source.author ?? 'human'))
  if (authors.size === 1) {
    return [...authors][0]
  }
  return authors.size ? 'both' : null
}

function sameMembers(left, right) {
  return left.length === right.length && left.every((id, index) => id === right[index])
}

/** The groups after the change: from a new cluster list, or from the old ones minus lost points. */
function nextClusters(state, change, pointIds) {
  const entries = change.clusters ? clusterEntries(change.clusters) : null
  if (change.clusters && !entries) {
    throw invalid('clusters must be a JSON array or an object with a "clusters" array')
  }
  if (entries) {
    return parseClusters(withoutReplies(entries), { pointIds, previous: state.clusters })
  }
  const known = new Set(pointIds)
  return state.clusters.flatMap((cluster) => {
    const points = cluster.points.filter((id) => known.has(id))
    return points.length ? [{ ...cluster, points }] : []
  })
}

/** Where every old group went: kept by ID, carried into the group of its first concern, or dropped. */
function routeOldClusters(oldClusters, clusters) {
  const ids = new Set(clusters.map((cluster) => cluster.id))
  const groupOf = new Map(
    clusters.flatMap((cluster) => cluster.points.map((id) => [id, cluster.id]))
  )
  const carried = new Map()
  const dropped = []
  const split = []
  for (const old of oldClusters) {
    const parts = [...new Set(old.points.map((id) => groupOf.get(id)).filter(Boolean))]
    if (parts.length > 1) {
      split.push({ from: old.id, into: parts })
    }
    if (ids.has(old.id)) {
      continue
    }
    if (parts.length) {
      carried.set(parts[0], [...(carried.get(parts[0]) ?? []), old])
    } else {
      dropped.push(old)
    }
  }
  return { carried, dropped, split }
}

function versionBy(cluster) {
  return cluster.author === 'agent' ? 'agent' : 'human'
}

/** Reply text of each group after the change, and the versions that keep what it replaced. */
function carryReplies(oldById, clusters, carried, supplied) {
  const versions = []
  const changedText = new Set()
  const result = clusters.map((cluster) => {
    const same = oldById.get(cluster.id)
    const incoming = carried.get(cluster.id) ?? []
    const sources = [...(same && written(same) ? [same] : []), ...incoming.filter(written)]
    const agentText = supplied.get(cluster.id)
    // Why: an agent's text only replaces a written reply when it carries others into it.
    const usable = agentText && (incoming.length || !written(same)) ? agentText : null
    if (!usable && !incoming.some(written)) {
      return cluster
    }
    const text = usable ?? sources.map((source) => source.response.trim()).join(JOIN)
    const before = same?.response ?? ''
    if (text === before) {
      return cluster
    }
    changedText.add(cluster.id)
    for (const source of sources) {
      versions.push({
        slot: cluster.id,
        by: versionBy(source),
        what:
          source.id === cluster.id
            ? 'Before the regroup'
            : `${source.id}'s reply before it moved into ${cluster.id}`,
        text: source.response
      })
    }
    const author = usable
      ? sources.length
        ? replyAuthorAfterAccept(joinedAuthor(sources))
        : 'agent'
      : joinedAuthor(sources)
    if (sources.length === 1 && sources[0].response === text) {
      // Why: a reply that only moved keeps who wrote it and how far along it was.
      return { ...cluster, response: text, author: sources[0].author, status: sources[0].status }
    }
    versions.push({
      slot: cluster.id,
      by: author === 'agent' || usable ? 'agent' : 'human',
      what: usable
        ? 'Agent reply for the regrouped concerns'
        : `Joined replies of ${sources.map((source) => source.id).join(', ')}`,
      text
    })
    return {
      ...cluster,
      response: text,
      author,
      status: cluster.status === 'todo' || cluster.status === 'done' ? 'drafting' : cluster.status
    }
  })
  return { clusters: result, versions, changedText }
}

function repoint(id, carriedTo, droppedIds) {
  if (droppedIds.has(id)) {
    return null
  }
  return carriedTo.get(id) ?? id
}

/** Promises, paper changes, predictions and proposals follow their group, or step aside with it. */
function followGroups(state, carriedTo, droppedIds, changedText) {
  const promises = state.promises.map((promise) => ({
    ...promise,
    clusters: [
      ...new Set(promise.clusters.map((id) => repoint(id, carriedTo, droppedIds)).filter(Boolean))
    ]
  }))
  const archivedChanges = state.paperChanges.filter((change) => droppedIds.has(change.cluster))
  const paperChanges = state.paperChanges
    .filter((change) => !droppedIds.has(change.cluster))
    .map((change) => ({ ...change, cluster: carriedTo.get(change.cluster) ?? change.cluster }))
  const predictions = state.predictions.map((prediction) =>
    prediction.trigger.cluster &&
    (carriedTo.has(prediction.trigger.cluster) || droppedIds.has(prediction.trigger.cluster))
      ? {
          ...prediction,
          trigger: {
            ...prediction.trigger,
            cluster: repoint(prediction.trigger.cluster, carriedTo, droppedIds)
          }
        }
      : prediction
  )
  const gone = (slot) => carriedTo.has(slot) || droppedIds.has(slot)
  const versions = state.proposals
    .filter((proposal) => gone(proposal.slot) && !proposal.applied)
    .map((proposal) => ({
      slot: proposal.slot,
      by: 'agent',
      what: 'Suggestion set aside by a regroup',
      text: proposal.text
    }))
  // Why: a reply whose text changed here is no longer what an earlier edit mark refers to.
  const proposals = state.proposals.filter(
    (proposal) => !gone(proposal.slot) && !(proposal.applied && changedText.has(proposal.slot))
  )
  return { promises, paperChanges, archivedChanges, predictions, proposals, versions }
}

/**
 * Plans a change of groups (`clusters`, a new list) or of points (`points`, the validated new
 * list) against `state`. Pure: returns the next records, the versions to keep, the archive of
 * dropped written groups, a summary, and whether any written reply was affected.
 */
export function planRegroup(state, change) {
  const points = change.points ?? state.points
  const pointIds = points.map((point) => point.id)
  const supplied = change.supplied ?? new Map()
  const oldById = new Map(state.clusters.map((cluster) => [cluster.id, cluster]))
  const parsed = nextClusters(state, change, pointIds)
  const { carried, dropped, split } = routeOldClusters(state.clusters, parsed)
  const carriedTo = new Map()
  for (const [target, sources] of carried) {
    for (const source of sources) {
      carriedTo.set(source.id, target)
    }
  }
  const droppedIds = new Set(dropped.map((cluster) => cluster.id))
  const replies = carryReplies(oldById, parsed, carried, supplied)
  const follow = followGroups(state, carriedTo, droppedIds, replies.changedText)
  const keptPoints = new Set(pointIds)
  const archive = dropped.filter(written).map((cluster) => ({
    cluster,
    points: state.points.filter(
      (point) => cluster.points.includes(point.id) && !keptPoints.has(point.id)
    ),
    paperChanges: follow.archivedChanges.filter((change) => change.cluster === cluster.id)
  }))
  const merged = [...carried].map(([into, sources]) => ({
    into,
    from: sources.map((source) => source.id),
    joined: !supplied.has(into)
  }))
  const moved = replies.clusters
    .filter((cluster) => {
      const old = oldById.get(cluster.id)
      return old && written(old) && !sameMembers(old.points, cluster.points)
    })
    .map((cluster) => cluster.id)
    .filter(
      (id) =>
        !merged.some((entry) => entry.into === id) && !split.some((entry) => entry.from === id)
    )
  const summary = {
    merged: merged.filter(
      (entry) =>
        entry.from.some((id) => written(oldById.get(id))) || written(oldById.get(entry.into))
    ),
    split: split.filter((entry) => written(oldById.get(entry.from))),
    removed: dropped.filter(written).map((cluster) => cluster.id),
    moved
  }
  const affected = new Set([
    ...summary.merged.flatMap((entry) => [entry.into, ...entry.from]),
    ...summary.split.flatMap((entry) => [entry.from, ...entry.into]),
    ...summary.removed,
    ...summary.moved,
    ...replies.changedText
  ])
  return {
    clusters: replies.clusters,
    points,
    promises: follow.promises,
    paperChanges: follow.paperChanges,
    predictions: follow.predictions,
    proposals: follow.proposals,
    versions: [...replies.versions, ...follow.versions],
    archive,
    summary,
    affected: [...affected].sort((left, right) => Number(left.slice(1)) - Number(right.slice(1))),
    touchesWritten:
      summary.merged.length + summary.split.length + summary.removed.length + summary.moved.length >
      0
  }
}

function list(ids) {
  return ids.length > 1 ? `${ids.slice(0, -1).join(', ')} and ${ids.at(-1)}` : ids[0]
}

/** One plain sentence per kind of change, e.g. "merged C2 into C1". */
export function regroupPhrases(summary) {
  return [
    ...summary.merged.map(
      (entry) =>
        `merged ${list(entry.from)} into ${entry.into}${entry.joined ? ' (replies joined)' : ''}`
    ),
    ...summary.split.map((entry) => `split ${entry.from} into ${list(entry.into)}`),
    ...summary.removed.map((id) => `removed ${id} (its reply is archived)`),
    ...summary.moved.map((id) => `moved concerns of ${id}`)
  ]
}
