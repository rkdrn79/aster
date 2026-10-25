import { useEffect, useState } from 'react'
import {
  emptyResearchGpuPolicy,
  type ResearchGpuPolicy
} from '../../../../shared/research/research-gpu-policy'

/** GPU limits per host and project, persisted by main in `research/gpu-policy.json`. */
export function useResearchGpuPolicy(enabled: boolean): {
  policy: ResearchGpuPolicy
  error: string | null
  save: (next: ResearchGpuPolicy) => Promise<void>
} {
  const [policy, setPolicy] = useState<ResearchGpuPolicy>(emptyResearchGpuPolicy)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) {
      return
    }
    window.api.researchCompute
      .readGpuPolicy()
      .then(setPolicy)
      .catch((cause: unknown) => setError(`GPU limits did not load. ${String(cause)}`))
  }, [enabled])

  return {
    policy,
    error,
    save: async (next) => {
      setPolicy(await window.api.researchCompute.saveGpuPolicy(next))
      setError(null)
    }
  }
}
