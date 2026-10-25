import { useCallback, useEffect, useRef, useState } from 'react'
import type { ExperimentRecord } from '../../../../shared/research/research-records'
import type {
  ResearchClaimsAuditResult,
  ResearchUnbackedNumbers
} from '../../../../shared/research/research-harness-results'
import { researchErrorText } from './research-error-text'
import { researchHarnessBridge } from './use-research-harness-experiment'

export type ResearchClaimsState = {
  /** False on SSH workspaces and in windows whose preload predates the harness bridge. */
  available: boolean
  audit: ResearchClaimsAuditResult | null
  scan: ResearchUnbackedNumbers | null
  scanError: string | null
  error: string | null
  checking: boolean
  recheck: () => void
}

/** The paper's claims audit; the unbacked-number scan runs only while the panel is open. */
export function useResearchClaims(
  experiment: ExperimentRecord,
  panelOpen: boolean
): ResearchClaimsState {
  const { claimsAudit, claimsScan } = researchHarnessBridge()
  const available = experiment.hostId === 'local' && Boolean(claimsAudit && claimsScan)
  const workspacePath = experiment.workspacePath
  const [audit, setAudit] = useState<ResearchClaimsAuditResult | null>(null)
  const [scan, setScan] = useState<ResearchUnbackedNumbers | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [scanError, setScanError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const request = useRef(0)

  const read = useCallback(
    async (withScan: boolean): Promise<void> => {
      const bridge = researchHarnessBridge()
      if (!available || !bridge.claimsAudit || !bridge.claimsScan) {
        return
      }
      const current = ++request.current
      setChecking(true)
      const [nextAudit, nextScan] = await Promise.all([
        bridge.claimsAudit({ workspacePath }).then(
          (value) => ({ value, error: null }),
          (cause: unknown) => ({ value: null, error: researchErrorText(cause) })
        ),
        withScan
          ? bridge.claimsScan({ workspacePath }).then(
              (value) => ({ value, error: null }),
              (cause: unknown) => ({ value: null, error: researchErrorText(cause) })
            )
          : null
      ])
      if (current !== request.current) {
        return
      }
      setAudit(nextAudit.value)
      setError(nextAudit.error)
      if (nextScan) {
        setScan(nextScan.value)
        setScanError(nextScan.error)
      }
      setChecking(false)
    },
    [available, workspacePath]
  )

  useEffect(() => {
    void read(panelOpen)
    return () => {
      request.current += 1
    }
  }, [panelOpen, read])

  const recheck = useCallback(() => void read(true), [read])
  return { available, audit, scan, scanError, error, checking, recheck }
}
