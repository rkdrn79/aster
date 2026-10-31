import { useEffect } from 'react'
import { create } from 'zustand'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import type { ResearchComputeStatusResult } from '../../../shared/research/research-compute-api'
import type { ResearchDeadlinesReadResult } from '../../../shared/research/research-deadlines-api'

const STALE_AFTER_MS = 30_000

export type PhoneHostRead<T> =
  | { status: 'loading' }
  | { status: 'ready'; result: T; readAt: number }
  | { status: 'error'; message: string; readAt: number }

type PhoneHostReads = {
  deadlines?: PhoneHostRead<ResearchDeadlinesReadResult>
  compute?: PhoneHostRead<ResearchComputeStatusResult>
}

/** The paired host's own deadlines and SLURM queue, for phone Home; read on open, not polled. */
export const usePhoneHostResearch = create<PhoneHostReads>(() => ({}))

const inFlight = new Set<keyof PhoneHostReads>()

function refresh<K extends keyof PhoneHostReads>(
  key: K,
  read: () => Promise<Extract<NonNullable<PhoneHostReads[K]>, { status: 'ready' }>['result']>
): void {
  const current = usePhoneHostResearch.getState()[key]
  if (
    inFlight.has(key) ||
    (current && current.status !== 'loading' && Date.now() - current.readAt < STALE_AFTER_MS)
  ) {
    return
  }
  inFlight.add(key)
  if (!current) {
    usePhoneHostResearch.setState({ [key]: { status: 'loading' } })
  }
  // Why local: in the web client the local target is the paired host.
  void read()
    .then(
      (result) =>
        usePhoneHostResearch.setState({ [key]: { status: 'ready', result, readAt: Date.now() } }),
      (error: unknown) =>
        usePhoneHostResearch.setState({
          [key]: {
            status: 'error',
            message: error instanceof Error ? error.message : String(error),
            readAt: Date.now()
          }
        })
    )
    .finally(() => inFlight.delete(key))
}

/** Reads the host's deadlines and compute status once they are stale. */
export function usePhoneHostResearchRefresh(): void {
  useEffect(() => {
    refresh('deadlines', () =>
      callRuntimeRpc<ResearchDeadlinesReadResult>({ kind: 'local' }, 'researchDeadlines.read', {})
    )
    refresh('compute', () =>
      // Why longer: the host waits up to 15s for squeue before it answers.
      callRuntimeRpc<ResearchComputeStatusResult>(
        { kind: 'local' },
        'researchCompute.status',
        undefined,
        { timeoutMs: 25_000 }
      )
    )
  }, [])
}
