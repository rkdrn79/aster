import { useState } from 'react'
import { toast } from 'sonner'
import { createBrowserUuid } from '@/lib/browser-uuid'
import type {
  ConferenceTracking,
  SubmissionStatus
} from '../../../../shared/research/conference-deadlines'
import { useConferenceDeadlines } from './conference-deadlines-store'
import type { CustomDeadlineDraft } from './research-deadline-custom-dialog'

type Change = (current: ConferenceTracking) => ConferenceTracking

export type ConferenceTrackingActions = {
  saving: boolean
  toggleSeries: (series: string) => void
  trackMany: (series: string[]) => void
  /** Untracks every conference at once; paper statuses and dates added by hand stay. */
  clearTracked: () => void
  /** null clears the paper back to "not submitted". */
  setStatus: (editionId: string, series: string | null, status: SubmissionStatus | null) => void
  addCustom: (draft: CustomDeadlineDraft) => Promise<void>
  removeCustom: (id: string) => void
  setDisplayTimeZone: (timeZone: string | null) => void
}

export function useConferenceTrackingActions(): ConferenceTrackingActions {
  const [saving, setSaving] = useState(false)

  async function save(change: Change): Promise<void> {
    setSaving(true)
    try {
      await useConferenceDeadlines.getState().update(change)
    } finally {
      setSaving(false)
    }
  }

  // Why: the store already shows the failure inline; a rejected fire-and-forget save needs no more.
  const quietly = (change: Change): void => void save(change).catch(() => undefined)

  function trackMany(series: string[]): void {
    quietly((current) => ({
      ...current,
      trackedSeries: [...new Set([...current.trackedSeries, ...series])]
    }))
  }

  return {
    saving,
    toggleSeries: (series) =>
      quietly((current) => ({
        ...current,
        trackedSeries: current.trackedSeries.includes(series)
          ? current.trackedSeries.filter((entry) => entry !== series)
          : [...current.trackedSeries, series]
      })),
    trackMany,
    clearTracked: () => {
      const tracking = useConferenceDeadlines.getState().tracking
      const previous = tracking?.trackedSeries ?? []
      if (!previous.length) {
        return
      }
      quietly((current) => ({ ...current, trackedSeries: [] }))
      toast(
        `Untracked ${previous.length} ${previous.length === 1 ? 'conference' : 'conferences'}`,
        {
          ...(tracking?.submissions.length
            ? { description: 'Papers you marked submitted stay on the timeline.' }
            : {}),
          action: { label: 'Undo', onClick: () => trackMany(previous) }
        }
      )
    },
    setStatus: (editionId, series, status) =>
      quietly((current) => {
        const others = current.submissions.filter((entry) => entry.editionId !== editionId)
        return {
          ...current,
          // Why: following a paper's decision only works if its conference stays on the timeline.
          trackedSeries:
            status && series && !current.trackedSeries.includes(series)
              ? [...current.trackedSeries, series]
              : current.trackedSeries,
          submissions: status
            ? [...others, { editionId, status, updatedAt: new Date().toISOString() }]
            : others
        }
      }),
    addCustom: (draft) =>
      save((current) => ({
        ...current,
        customDeadlines: [
          ...current.customDeadlines,
          { id: createBrowserUuid(), ...draft, createdAt: new Date().toISOString() }
        ]
      })),
    removeCustom: (id) =>
      quietly((current) => ({
        ...current,
        customDeadlines: current.customDeadlines.filter((entry) => entry.id !== id)
      })),
    setDisplayTimeZone: (displayTimeZone) => quietly((current) => ({ ...current, displayTimeZone }))
  }
}
