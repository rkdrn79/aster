import { useMemo, useState } from 'react'
import type { ResearchRunRecord } from '../../../../shared/research/research-records'
import type {
  ResearchPairwiseVerdict,
  ResearchSingleVerdict
} from '../../../../shared/research/research-sample-ratings'
import type { QualitativeSample } from './research-qualitative-outputs'
import { useResearchRecords } from './research-records-store'
import { researchErrorText } from './research-error-text'
import { blindSwapsSides, verdictForChoice, type ABChoice } from './research-sample-rating-blind'
import {
  NO_JUDGMENTS,
  indexSampleRatings,
  isPairwiseVerdict,
  parseRatingTags,
  sampleJudgments,
  sampleMatchesFilter,
  type SampleRatingFilter,
  type SampleRatingScope
} from './research-sample-rating-index'
import { useSampleRatings, type SampleRatingSummaryRequest } from './research-sample-rating-state'
import { launchSampleJudge } from './research-sample-judge-launch'
import { judgeRun, ratableRuns, type RatableRun } from './research-sample-rating-runs'

export type RatingMode = 'view' | 'single' | 'ab'
type SamplesByRun = ReadonlyMap<string, ReadonlyMap<string, QualitativeSample>>

const KEY_CHOICES: Record<string, ABChoice> = { '1': 'left', '2': 'right', '3': 'tie' }

function isTextEntry(target: EventTarget): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  )
}

export function ratingUnitKey(sampleId: string, run: string, against: string | null): string {
  return JSON.stringify([sampleId, run, against])
}

/**
 * Rating mode, the A/B pair, filters and saved judgments for the Outputs tab. A is the
 * Experiment's baseline; without one, the first Run.
 */
export function useSampleRatingSession(
  runs: ResearchRunRecord[],
  samplesByRun: SamplesByRun,
  experimentBaselineId: string | null
) {
  const experiments = useResearchRecords((state) => state.document?.experiments)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mode, setMode] = useState<RatingMode>('view')
  const [candidateId, setCandidateId] = useState<string | null>(null)
  const [blind, setBlind] = useState(false)
  const [filter, setFilter] = useState<SampleRatingFilter>('all')
  const [tagDrafts, setTagDrafts] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [rateError, setRateError] = useState<string | null>(null)

  const baselineRunId = runs.some((run) => run.id === experimentBaselineId)
    ? experimentBaselineId
    : (runs[0]?.id ?? null)
  const ratable = useMemo(
    () => ratableRuns(runs, experiments ?? [], baselineRunId),
    [runs, experiments, baselineRunId]
  )
  const baseline = ratable.find((entry) => entry.run.id === baselineRunId) ?? ratable[0] ?? null
  const candidates = ratable.filter((entry) => entry !== baseline)
  const candidate =
    candidates.find((entry) => entry.run.id === candidateId) ?? candidates[0] ?? null
  const activeMode: RatingMode =
    (mode === 'ab' && !candidate) || (mode === 'single' && !ratable.length) ? 'view' : mode
  const pair = useMemo(
    () => (activeMode === 'ab' && baseline && candidate ? { baseline, candidate } : null),
    [activeMode, baseline, candidate]
  )

  const ratingExperiments = useMemo(() => {
    if (activeMode === 'view') {
      return []
    }
    const slugs = pair
      ? [pair.candidate.experiment, pair.baseline.experiment]
      : ratable.map((entry) => entry.experiment)
    return [...new Set(slugs)]
  }, [activeMode, pair, ratable])
  const summaryRequests = useMemo((): SampleRatingSummaryRequest[] => {
    if (pair) {
      // From B's side, so wins are the candidate's.
      return [
        {
          key: 'ab',
          experiment: pair.candidate.experiment,
          run: pair.candidate.ref,
          against: pair.baseline.ref
        }
      ]
    }
    return activeMode === 'single'
      ? ratable.map((entry) => ({
          key: entry.ref,
          experiment: entry.experiment,
          run: entry.ref,
          against: null
        }))
      : []
  }, [activeMode, pair, ratable])
  const ratings = useSampleRatings(
    baseline?.run.workspacePath ?? null,
    ratingExperiments,
    summaryRequests
  )
  const index = useMemo(() => indexSampleRatings(ratings.ratings), [ratings.ratings])

  const sampleIds = useMemo(
    () => [...new Set(runs.flatMap((run) => [...(samplesByRun.get(run.id)?.keys() ?? [])]))],
    [runs, samplesByRun]
  )
  const runIdByRef = new Map(ratable.map((entry) => [entry.ref, entry.run.id]))
  const hasSample = (ref: string, sampleId: string): boolean =>
    samplesByRun.get(runIdByRef.get(ref) ?? '')?.has(sampleId) ?? false
  const scope: SampleRatingScope | null = pair
    ? { mode: 'pairwise', run: pair.baseline.ref, against: pair.candidate.ref }
    : activeMode === 'single'
      ? { mode: 'single', runs: ratable.map((entry) => entry.ref) }
      : null
  const scopedIds =
    scope?.mode === 'pairwise'
      ? sampleIds.filter((id) => hasSample(scope.run, id) && hasSample(scope.against, id))
      : sampleIds
  const visibleIds = scope
    ? scopedIds.filter((id) =>
        sampleMatchesFilter(filter, id, scope, index, (ref) => hasSample(ref, id))
      )
    : scopedIds
  const activeId = selectedId && visibleIds.includes(selectedId) ? selectedId : visibleIds[0]
  const position = activeId ? visibleIds.indexOf(activeId) : -1

  const swapped = Boolean(
    pair &&
    blind &&
    activeId &&
    blindSwapsSides(`${pair.baseline.ref}\u0000${pair.candidate.ref}`, activeId)
  )
  const pairJudgments =
    pair && activeId
      ? sampleJudgments(index, activeId, pair.baseline.ref, pair.candidate.ref)
      : NO_JUDGMENTS
  const userPairVerdict =
    pairJudgments.user && isPairwiseVerdict(pairJudgments.user.verdict)
      ? pairJudgments.user.verdict
      : null

  function move(delta: number): void {
    const next = visibleIds[position + delta]
    if (next) {
      setSelectedId(next)
    }
  }

  async function record(
    input: {
      experiment: string
      run: string
      against: string | null
      verdict: ResearchSingleVerdict | ResearchPairwiseVerdict
      existingTags: string[]
    },
    advance: boolean
  ): Promise<void> {
    const workspacePath = baseline?.run.workspacePath
    if (!activeId || !workspacePath || saving) {
      return
    }
    const unitKey = ratingUnitKey(activeId, input.run, input.against)
    const parsed = parseRatingTags(tagDrafts[unitKey] ?? input.existingTags.join(', '))
    if ('error' in parsed) {
      setRateError(parsed.error)
      return
    }
    const next = advance ? (visibleIds[position + 1] ?? null) : null
    setSaving(true)
    setRateError(null)
    try {
      await window.api.researchRatings.add({
        workspacePath,
        experiment: input.experiment,
        sampleId: activeId,
        run: input.run,
        against: input.against,
        verdict: input.verdict,
        tags: parsed.tags,
        note: null,
        blind: input.against !== null && blind
      })
      setTagDrafts((drafts) =>
        Object.fromEntries(Object.entries(drafts).filter(([key]) => key !== unitKey))
      )
      if (next) {
        setSelectedId(next)
      }
      ratings.refresh()
    } catch (cause) {
      setRateError(`The rating was not saved. ${researchErrorText(cause)}`)
    } finally {
      setSaving(false)
    }
  }

  function rateSingle(entry: RatableRun, verdict: ResearchSingleVerdict): void {
    if (!activeId) {
      return
    }
    const existing = sampleJudgments(index, activeId, entry.ref, null).user
    void record(
      {
        experiment: entry.experiment,
        run: entry.ref,
        against: null,
        verdict,
        existingTags: existing?.tags ?? []
      },
      false
    )
  }

  function choose(choice: ABChoice): void {
    if (!pair) {
      return
    }
    void record(
      {
        experiment: pair.candidate.experiment,
        run: pair.baseline.ref,
        against: pair.candidate.ref,
        verdict: verdictForChoice(choice, swapped),
        existingTags: pairJudgments.user?.tags ?? []
      },
      true
    )
  }

  function onKeyDown(event: React.KeyboardEvent): void {
    if (event.altKey || event.ctrlKey || event.metaKey || isTextEntry(event.target)) {
      return
    }
    const choice = KEY_CHOICES[event.key]
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      move(event.key === 'ArrowLeft' ? -1 : 1)
    } else if (pair && choice && !saving) {
      event.preventDefault()
      choose(choice)
    }
  }

  function judge(): Promise<string | null> {
    if (!baseline) {
      return Promise.resolve('Choose a catalog Run to judge.')
    }
    return launchSampleJudge({
      hostId: baseline.run.hostId,
      workspaceId: baseline.run.workspaceId,
      workspacePath: baseline.run.workspacePath,
      target: pair
        ? { mode: 'pairwise', a: judgeRun(pair.baseline), b: judgeRun(pair.candidate) }
        : { mode: 'single', runs: ratable.map(judgeRun) }
    })
  }

  return {
    ratable,
    baselineRunId,
    candidates,
    candidate,
    pair,
    activeMode,
    setMode,
    setCandidateId,
    blind,
    setBlind,
    filter,
    setFilter,
    ratings,
    index,
    scope,
    sampleIds,
    scopedIds,
    visibleIds,
    activeId,
    position,
    setSelectedId,
    move,
    swapped,
    pairJudgments,
    userPairVerdict,
    hasSample,
    saving,
    rateError,
    rateSingle,
    choose,
    onKeyDown,
    judge,
    tagsValue: (unitKey: string, existing: string[]): string =>
      tagDrafts[unitKey] ?? existing.join(', '),
    setTagsValue: (unitKey: string, value: string): void =>
      setTagDrafts((drafts) => ({ ...drafts, [unitKey]: value }))
  }
}

export type SampleRatingSession = ReturnType<typeof useSampleRatingSession>
