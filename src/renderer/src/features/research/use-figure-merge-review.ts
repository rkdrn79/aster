import { useCallback, useRef, useState } from 'react'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { noteFigureConflicts } from './research-figure-agent-write'
import type { FigureMergeConflict } from './research-figure-merge'
import { applyMergeChoices } from './research-figure-sync-merge'
import type { FigureTarget } from './research-figures-export'

/**
 * What the agent and the person both changed in one merge. The person's version is on the canvas
 * and is saved as usual (it wins, and the agent is told); the review only offers the agent's.
 */
export function useFigureMergeReview(
  target: FigureTarget,
  apiRef: React.RefObject<ExcalidrawImperativeAPI | null>,
  onResolved: () => void
) {
  const [review, setReview] = useState<FigureMergeConflict[] | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const reviewRef = useRef<FigureMergeConflict[] | null>(null)

  const offerReview = useCallback(
    (conflicts: FigureMergeConflict[]) => {
      reviewRef.current = conflicts
      setReview(conflicts)
      void noteFigureConflicts(target, conflicts)
    },
    [target]
  )

  const resolveReview = useCallback(
    (choices: Readonly<Record<string, 'mine' | 'agent'>>) => {
      const api = apiRef.current
      const conflicts = reviewRef.current
      if (!api || !conflicts) {
        return
      }
      applyMergeChoices(api, conflicts, choices)
      reviewRef.current = null
      setReview(null)
      setReviewOpen(false)
      onResolved()
    },
    [apiRef, onResolved]
  )

  return { review, reviewOpen, setReviewOpen, offerReview, resolveReview }
}
