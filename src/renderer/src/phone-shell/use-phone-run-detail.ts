import { useCallback, useEffect, useRef, useState } from 'react'
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

export type PhoneRunRef = { worktreeId: string; experiment: string; run: string }

export type PhoneRunDetail = {
  run: ResearchProjectRunReadResult | null
  log: ResearchProjectRunLogTailResult | null
  runError: string | null
  logError: string | null
  loading: boolean
  refresh: () => void
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** One Run's files and log tail from the host, re-read on demand. */
export function usePhoneRunDetail(ref: PhoneRunRef): PhoneRunDetail {
  const [state, setState] = useState<Omit<PhoneRunDetail, 'refresh'>>({
    run: null,
    log: null,
    runError: null,
    logError: null,
    loading: true
  })
  const generation = useRef(0)
  const { worktreeId, experiment, run } = ref

  const refresh = useCallback(() => {
    const current = ++generation.current
    setState((previous) => ({ ...previous, loading: true }))
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
  }, [worktreeId, experiment, run])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { ...state, refresh }
}
