import {
  RESEARCH_MEDIA_KINDS,
  type ResearchMediaKind,
  type ResearchRunMediaItem
} from '../../../../shared/research/research-run-media'

/** A media file's training step; null when it was recorded without one. */
export type MediaStep = number | null

export type MediaLabelGroup = {
  label: string | null
  /** Ascending, with "no step" first. */
  steps: MediaStep[]
  itemsByStep: ReadonlyMap<MediaStep, ResearchRunMediaItem[]>
  count: number
}

const names = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })

function compareSteps(left: MediaStep, right: MediaStep): number {
  if (left === right) {
    return 0
  }
  if (left === null) {
    return -1
  }
  return right === null ? 1 : left - right
}

function compareLabels(left: string | null, right: string | null): number {
  if (left === right) {
    return 0
  }
  if (left === null) {
    return 1
  }
  return right === null ? -1 : names.compare(left, right)
}

export function mediaKindCounts(
  items: readonly ResearchRunMediaItem[]
): Record<ResearchMediaKind, number> {
  const counts: Record<ResearchMediaKind, number> = { image: 0, video: 0, audio: 0 }
  for (const item of items) {
    counts[item.kind] += 1
  }
  return counts
}

export function presentMediaKinds(items: readonly ResearchRunMediaItem[]): ResearchMediaKind[] {
  const counts = mediaKindCounts(items)
  return RESEARCH_MEDIA_KINDS.filter((kind) => counts[kind] > 0)
}

/** Labels in name order (unlabeled last); within a label, files by step in index order. */
export function groupMediaByLabel(items: readonly ResearchRunMediaItem[]): MediaLabelGroup[] {
  const byLabel = new Map<string | null, Map<MediaStep, ResearchRunMediaItem[]>>()
  for (const item of items) {
    const steps = byLabel.get(item.label) ?? new Map<MediaStep, ResearchRunMediaItem[]>()
    byLabel.set(item.label, steps)
    const bucket = steps.get(item.step) ?? []
    steps.set(item.step, bucket)
    bucket.push(item)
  }
  return [...byLabel.entries()]
    .sort(([left], [right]) => compareLabels(left, right))
    .map(([label, itemsByStep]) => ({
      label,
      steps: [...itemsByStep.keys()].sort(compareSteps),
      itemsByStep,
      count: [...itemsByStep.values()].reduce((total, bucket) => total + bucket.length, 0)
    }))
}

/** The highest numbered step, or null when every file lacks one. */
export function latestMediaStep(steps: readonly MediaStep[]): MediaStep {
  return steps.reduce<MediaStep>(
    (latest, step) => (step !== null && (latest === null || step > latest) ? step : latest),
    null
  )
}

export type RunMediaItems = { runId: string; items: readonly ResearchRunMediaItem[] }

export type MediaCompareLabel = {
  label: string | null
  /** Every step any Run has under this label. */
  steps: MediaStep[]
  /** Steps every Run has under this label. */
  sharedSteps: MediaStep[]
}

export type MediaCompareKey = { label: string | null; step: MediaStep }

export function mediaCompareLabels(runs: readonly RunMediaItems[]): MediaCompareLabel[] {
  const perRun = runs.map(({ items }) => groupMediaByLabel(items))
  const labels = [...new Set(perRun.flatMap((groups) => groups.map((group) => group.label)))].sort(
    compareLabels
  )
  return labels.map((label) => {
    const stepSets = perRun.map(
      (groups) => new Set(groups.find((group) => group.label === label)?.steps ?? [])
    )
    const steps = [...new Set(stepSets.flatMap((set) => [...set]))].sort(compareSteps)
    return {
      label,
      steps,
      sharedSteps: steps.filter((step) => stepSets.every((set) => set.has(step)))
    }
  })
}

/** A label at its latest step every Run shares, or at its latest step when none is shared. */
export function mediaCompareKeyForLabel(entry: MediaCompareLabel): MediaCompareKey {
  const steps = entry.sharedSteps.length ? entry.sharedSteps : entry.steps
  return { label: entry.label, step: latestMediaStep(steps) ?? steps[0] ?? null }
}

/** The first label every Run shares a step of, at the latest such step; null when none is shared. */
export function sharedMediaCompareKey(
  labels: readonly MediaCompareLabel[]
): MediaCompareKey | null {
  const shared = labels.find((entry) => entry.sharedSteps.length > 0)
  return shared ? mediaCompareKeyForLabel(shared) : null
}

/** The user's choice while the Runs still have it; else the shared default, else the first label. */
export function chosenMediaCompareKey(
  labels: readonly MediaCompareLabel[],
  chosen: MediaCompareKey | null
): MediaCompareKey | null {
  const entry = chosen ? labels.find((candidate) => candidate.label === chosen.label) : undefined
  if (chosen && entry?.steps.includes(chosen.step)) {
    return chosen
  }
  const first = labels[0]
  return sharedMediaCompareKey(labels) ?? (first ? mediaCompareKeyForLabel(first) : null)
}

function byIdThenPath(left: ResearchRunMediaItem, right: ResearchRunMediaItem): number {
  return (
    names.compare(left.sampleId ?? '', right.sampleId ?? '') || names.compare(left.path, right.path)
  )
}

/**
 * Rows of files to show side by side at one label and step, one column per Run (null where a Run
 * has none). Rows pair by sample ID when every file has one, otherwise by position.
 */
export function alignedMediaRows(
  runs: readonly RunMediaItems[],
  key: MediaCompareKey
): (ResearchRunMediaItem | null)[][] {
  const buckets = runs.map(({ items }) =>
    items.filter((item) => item.label === key.label && item.step === key.step).sort(byIdThenPath)
  )
  const everyHasId = buckets.every((bucket) => bucket.every((item) => Boolean(item.sampleId)))
  if (everyHasId) {
    const ids = new Set(
      buckets.flatMap((bucket) => bucket.flatMap((item) => (item.sampleId ? [item.sampleId] : [])))
    )
    return [...ids]
      .sort(names.compare)
      .map((id) => buckets.map((bucket) => bucket.find((item) => item.sampleId === id) ?? null))
  }
  const rows = Math.max(0, ...buckets.map((bucket) => bucket.length))
  return Array.from({ length: rows }, (_, row) => buckets.map((bucket) => bucket[row] ?? null))
}

export function mediaStepText(step: MediaStep): string {
  return step === null ? 'No step' : `Step ${step}`
}

export function mediaFileName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1) || path
}
