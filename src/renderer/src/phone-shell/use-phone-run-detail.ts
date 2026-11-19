import { useCallback, useEffect, useRef, useState } from 'react'
import { installWindowVisibilityInterval } from '@/lib/window-visibility-interval'
import {
  readResearchProjectRunLogTailOnHost,
  readResearchProjectRunOnHost
} from '@/features/research/research-project-host-reads'
import type {
  ResearchProjectRunLogTailResult,
  ResearchProjectRunReadResult
} from '../../../shared/research/research-project-api'

// Why small: a phone screen shows the last few hundred lines; the host caps bigger asks anyway.
const LOG_TAIL_BYTES = 32 * 1024
const METRIC_POINTS = 120
// Why 5 s: a training log moves every few seconds; the host reads only the tail and a few files.
const LIVE_POLL_MS = 5_000

export type PhoneRunRef = { worktreeId: string; experiment: string; run: string }

export type PhoneRunDetail = {
  run: ResearchProjectRunReadResult | null
  log: ResearchProjectRunLogTailResult | null
  runError: string | null
  logError: string | null
  loading: boolean
  /** True while the Run is running, so the screen re-reads it on its own. */
  live: boolean
  refresh: () => void
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** One Run's files and log tail from the host, re-read on demand and every 5 s while it runs. */
export function usePhoneRunDetail(ref: PhoneRunRef): PhoneRunDetail {
  const [state, setState] = useState<Omit<PhoneRunDetail, 'refresh' | 'live'>>({
    run: null,
    log: null,
    runError: null,
    logError: null,
    loading: true
  })
  const generation = useRef(0)
  const { worktreeId, experiment, run } = ref

  const read = useCallback(
    (quiet: boolean) => {
      const current = ++generation.current
      if (!quiet) {
        setState((previous) => ({ ...previous, loading: true }))
      }
      // Why local: in the web client the local target is the paired host that owns the workspace.
      const target = { kind: 'local' } as const
      void Promise.allSettled([
        readResearchProjectRunOnHost(target, {
          worktreeId,
          experiment,
          run,
          maxPoints: METRIC_POINTS
        }),
        readResearchProjectRunLogTailOnHost(target, {
          worktreeId,
          experiment,
          run,
          maxBytes: LOG_TAIL_BYTES
        })
      ]).then(([runResult, logResult]) => {
        if (current !== generation.current) {
          return
        }
        setState((previous) => ({
          run: runResult.status === 'fulfilled' ? runResult.value : previous.run,
          log: logResult.status === 'fulfilled' ? logResult.value : previous.log,
          runError: runResult.status === 'rejected' ? message(runResult.reason) : null,
          logError: logResult.status === 'rejected' ? message(logResult.reason) : null,
          loading: false
        }))
      })
    },
    [worktreeId, experiment, run]
  )
  const refresh = useCallback(() => read(false), [read])

  useEffect(() => {
    refresh()
  }, [refresh])

  const manifest = state.run?.manifest.status === 'present' ? state.run.manifest.value : null
  const live = manifest?.execution?.state === 'running'
  useEffect(() => {
    if (!live) {
      return
    }
    let first = true
    return installWindowVisibilityInterval({
      // Why skip the first: the interval runs at once, right after the read that found it running.
      run: () => {
        if (!first) {
          read(true)
        }
        first = false
      },
      intervalMs: LIVE_POLL_MS
    })
  }, [live, read])

  return { ...state, live, refresh }
}
