import { useCallback, useEffect, useState } from 'react'
import { installWindowVisibilityInterval } from '@/lib/window-visibility-interval'
import type {
  ResearchSampleRating,
  ResearchSampleRatingSummary
} from '../../../../shared/research/research-sample-ratings'
import { researchErrorText } from './research-error-text'

// Why: agent judges write through the CLI, so their ratings must appear without a manual refresh.
const POLL_MS = 10_000

export type SampleRatingSummaryRequest = {
  key: string
  experiment: string
  run: string
  against: string | null
}

type RatingsSnapshot = {
  owner: string
  ratings: ResearchSampleRating[]
  summaries: Record<string, ResearchSampleRatingSummary>
  error: string | null
}

export type SampleRatingsState = {
  ratings: ResearchSampleRating[]
  summaries: Record<string, ResearchSampleRatingSummary>
  loaded: boolean
  error: string | null
  refresh: () => void
}

/**
 * Ratings of the given Experiments' ledgers and the requested summaries, re-read every 10 s.
 * Pass memoized arrays; a new array identity restarts the polling.
 */
export function useSampleRatings(
  workspacePath: string | null,
  experiments: readonly string[],
  summaryRequests: readonly SampleRatingSummaryRequest[]
): SampleRatingsState {
  const owner = JSON.stringify([workspacePath, experiments, summaryRequests])
  const [snapshot, setSnapshot] = useState<RatingsSnapshot | null>(null)
  const [revision, setRevision] = useState(0)
  const refresh = useCallback(() => setRevision((value) => value + 1), [])

  useEffect(() => {
    const api = window.api.researchRatings
    const path = workspacePath
    if (!api || !path || !experiments.length) {
      return
    }
    let active = true
    let reading = false
    const read = async (): Promise<void> => {
      if (reading) {
        return
      }
      reading = true
      try {
        const [lists, summaries] = await Promise.all([
          Promise.all(
            experiments.map((experiment) => api.list({ workspacePath: path, experiment }))
          ),
          Promise.all(
            summaryRequests.map(async (request) => {
              const summary = await api.summary({
                workspacePath: path,
                experiment: request.experiment,
                run: request.run,
                against: request.against
              })
              return [request.key, summary] as const
            })
          )
        ])
        if (active) {
          setSnapshot({
            owner,
            ratings: lists.flatMap((list) => list.ratings),
            summaries: Object.fromEntries(summaries),
            error: null
          })
        }
      } catch (cause) {
        if (active) {
          setSnapshot((current) => ({
            owner,
            ratings: current?.owner === owner ? current.ratings : [],
            summaries: current?.owner === owner ? current.summaries : {},
            error: researchErrorText(cause)
          }))
        }
      } finally {
        reading = false
      }
    }
    const stop = installWindowVisibilityInterval({ run: () => void read(), intervalMs: POLL_MS })
    return () => {
      active = false
      stop()
    }
  }, [experiments, owner, revision, summaryRequests, workspacePath])

  const current = snapshot?.owner === owner ? snapshot : null
  return {
    ratings: current?.ratings ?? [],
    summaries: current?.summaries ?? {},
    loaded: current !== null,
    error: current?.error ?? null,
    refresh
  }
}
