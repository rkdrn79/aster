import { useCallback, useEffect, useRef, useState } from 'react'
import type { WritingCheckResult } from '../../../../shared/research/research-writing-results'
import { researchErrorText } from './research-error-text'
import { researchHarnessBridge } from './use-research-harness-experiment'

export type ResearchWritingCheckState = {
  /** False on SSH workspaces and in windows whose preload predates the writing check. */
  available: boolean
  result: WritingCheckResult | null
  error: string | null
  checking: boolean
  recheck: () => void
}

/** The manuscript's writing check; it runs when the panel opens and on Re-check. */
export function useResearchWritingCheck(
  owner: { hostId: string; workspacePath: string },
  panelOpen: boolean
): ResearchWritingCheckState {
  const available = owner.hostId === 'local' && Boolean(researchHarnessBridge().writingCheck)
  const workspacePath = owner.workspacePath
  const [result, setResult] = useState<WritingCheckResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const request = useRef(0)

  const read = useCallback(async (): Promise<void> => {
    const check = researchHarnessBridge().writingCheck
    if (!available || !check) {
      return
    }
    const current = ++request.current
    setChecking(true)
    const next = await check({ workspacePath }).then(
      (value) => ({ value, error: null }),
      (cause: unknown) => ({ value: null, error: researchErrorText(cause) })
    )
    if (current !== request.current) {
      return
    }
    setResult(next.value)
    setError(next.error)
    setChecking(false)
  }, [available, workspacePath])

  useEffect(() => {
    if (panelOpen) {
      void read()
    }
    return () => {
      request.current += 1
      setChecking(false)
    }
  }, [panelOpen, read])

  const recheck = useCallback(() => void read(), [read])
  return { available, result, error, checking, recheck }
}
