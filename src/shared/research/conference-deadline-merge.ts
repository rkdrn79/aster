import { resolveDeadlineInstant } from './conference-deadline-time'
import type {
  ConferenceCatalog,
  ConferenceCatalogCache,
  ConferenceDeadline,
  ConferenceEdition,
  ConferenceSource,
  ConferenceSourceSnapshot
} from './conference-deadlines'
import { conferenceTopic } from './conference-topics'

// Why: sources often state one deadline in different zones, which can shift its calendar day.
const SAME_DEADLINE_WINDOW_MS = 36 * 60 * 60 * 1000

function instant(deadline: ConferenceDeadline): number | null {
  return resolveDeadlineInstant(deadline.date, deadline.timezone)?.epochMs ?? null
}

function deadlineKind(deadline: ConferenceDeadline): string {
  return deadline.type === 'submission' || deadline.type === 'full_paper' ? 'paper' : deadline.type
}

function closestTwin(
  deadline: ConferenceDeadline,
  candidates: ConferenceDeadline[]
): ConferenceDeadline | null {
  const at = instant(deadline)
  if (at === null) {
    return null
  }
  let best: { entry: ConferenceDeadline; score: number } | null = null
  for (const candidate of candidates) {
    const other = instant(candidate)
    if (candidate.stage !== deadline.stage || other === null) {
      continue
    }
    const distance = Math.abs(other - at)
    const score = distance + (candidate.type === deadline.type ? 0 : SAME_DEADLINE_WINDOW_MS)
    if (distance <= SAME_DEADLINE_WINDOW_MS && (!best || score < best.score)) {
      best = { entry: candidate, score }
    }
  }
  return best?.entry ?? null
}

/** Keeps `primary`'s wording, drops `secondary` duplicates and flags submission dates that disagree. */
export function mergeDeadlines(
  primary: ConferenceDeadline[],
  secondary: ConferenceDeadline[]
): ConferenceDeadline[] {
  const unmatched = new Set(secondary)
  const merged = primary.map((deadline) => {
    const twin = closestTwin(deadline, [...unmatched])
    if (!twin) {
      return deadline
    }
    unmatched.delete(twin)
    return deadline.stage === 'submission'
      ? { ...deadline, agreement: 'confirmed' as const }
      : deadline
  })
  // Why: only a conflict when the other source lists the same kind of deadline on another date.
  const disputed = (deadline: ConferenceDeadline, others: ConferenceDeadline[]): boolean =>
    deadline.stage === 'submission' &&
    !deadline.agreement &&
    others.some(
      (other) => other.stage === 'submission' && deadlineKind(other) === deadlineKind(deadline)
    )
  return [
    ...merged.map((deadline) =>
      disputed(deadline, secondary) ? { ...deadline, agreement: 'disputed' as const } : deadline
    ),
    ...[...unmatched].map((deadline) =>
      disputed(deadline, primary) ? { ...deadline, agreement: 'disputed' as const } : deadline
    )
  ]
}

function mergeEdition(preferred: ConferenceEdition, other: ConferenceEdition): ConferenceEdition {
  const tags = preferred.tags.length ? preferred.tags : other.tags
  const category = preferred.category ?? other.category
  return {
    ...other,
    ...preferred,
    tags,
    ...(category ? { category } : {}),
    topic: conferenceTopic(preferred.series, tags, category),
    rank: { ...preferred.rank, ...other.rank },
    deadlines: mergeDeadlines(preferred.deadlines, other.deadlines)
  }
}

function uniqueEditions(snapshot: ConferenceSourceSnapshot | undefined): ConferenceEdition[] {
  const seen = new Set<string>()
  return (snapshot?.editions ?? []).filter((edition) => {
    if (seen.has(edition.id)) {
      return false
    }
    seen.add(edition.id)
    return true
  })
}

/** Hugging Face wording and milestones lead; ccfddl adds breadth and CCF/CORE ranks. */
export function mergeConferenceSnapshots(
  snapshots: ConferenceSourceSnapshot[]
): ConferenceEdition[] {
  const find = (source: ConferenceSource): ConferenceSourceSnapshot | undefined =>
    snapshots.find((snapshot) => snapshot.source === source)
  const remaining = new Map(uniqueEditions(find('ccfddl')).map((edition) => [edition.id, edition]))
  const merged = uniqueEditions(find('huggingface')).map((edition) => {
    const other = remaining.get(edition.id)
    if (!other) {
      return edition
    }
    remaining.delete(edition.id)
    return mergeEdition(edition, other)
  })
  return [...merged, ...remaining.values()]
}

export function buildConferenceCatalog(
  cache: ConferenceCatalogCache,
  failed: readonly ConferenceSource[] = []
): ConferenceCatalog {
  const fetchedAt = cache.snapshots
    .map((snapshot) => snapshot.fetchedAt)
    .sort()
    .at(-1)
  return {
    fetchedAt: fetchedAt ?? new Date(0).toISOString(),
    sources: (['huggingface', 'ccfddl'] as const).flatMap((source) => {
      const snapshot = cache.snapshots.find((entry) => entry.source === source)
      return snapshot || failed.includes(source)
        ? [{ source, fetchedAt: snapshot?.fetchedAt ?? null, failed: failed.includes(source) }]
        : []
    }),
    editions: mergeConferenceSnapshots(cache.snapshots)
  }
}
