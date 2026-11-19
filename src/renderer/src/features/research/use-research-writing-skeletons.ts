import { useCallback, useEffect, useRef, useState } from 'react'
import type { WritingSkeleton } from '../../../../shared/research/research-writing-results'
import { installWindowVisibilityInterval } from '@/lib/window-visibility-interval'
import { researchErrorText } from './research-error-text'
import { researchHarnessBridge } from './use-research-harness-experiment'

// Why polling: the Writing agent writes skeletons through the CLI in its own process, and the card
// must show a new draft while the person is looking at the pane.
const POLL_MS = 3000

export type ResearchWritingSkeletonsState = {
  available: boolean
  skeletons: WritingSkeleton[]
  error: string | null
  refresh: () => Promise<void>
}

function sameSkeletons(left: WritingSkeleton[], right: WritingSkeleton[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

/** The project's writing skeletons, re-read every few seconds while the pane is visible. */
export function useResearchWritingSkeletons(
  owner: { hostId: string; workspacePath: string },
  visible: boolean
): ResearchWritingSkeletonsState {
  const available = owner.hostId === 'local' && Boolean(researchHarnessBridge().writingSkeletons)
  const workspacePath = owner.workspacePath
  const [skeletons, setSkeletons] = useState<WritingSkeleton[]>([])
  const [error, setError] = useState<string | null>(null)
  const request = useRef(0)

  const refresh = useCallback(async (): Promise<void> => {
    const list = researchHarnessBridge().writingSkeletons
    if (!available || !list) {
      return
    }
    const current = ++request.current
    try {
      const next = await list({ workspacePath })
      if (current === request.current) {
        setSkeletons((previous) => (sameSkeletons(previous, next) ? previous : next))
        setError(null)
      }
    } catch (cause) {
      if (current === request.current) {
        setError(researchErrorText(cause))
      }
    }
  }, [available, workspacePath])

  useEffect(() => {
    if (!visible || !available) {
      return
    }
    void refresh()
    const stop = installWindowVisibilityInterval({ run: () => void refresh(), intervalMs: POLL_MS })
    return () => {
      stop()
      request.current += 1
    }
  }, [visible, available, refresh])

  return { available, skeletons, error, refresh }
}
