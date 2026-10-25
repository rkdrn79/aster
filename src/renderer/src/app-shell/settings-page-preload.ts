import { useEffect } from 'react'
import { scheduleAfterInputQuiet } from '@/lib/input-quiet-scheduler'
import { lazyWithPreload } from '@/lib/lazy-with-retry'

export const SettingsPage = lazyWithPreload(() => import('../components/settings/Settings'))

/** Loads the ~1 MB Settings chunk once startup is quiet, so its first open does not wait ~0.8 s. */
export function usePreloadSettingsPage(): void {
  useEffect(
    () =>
      scheduleAfterInputQuiet(SettingsPage.preload, {
        delayMs: 4_000,
        quietMs: 500,
        idleTimeoutMs: 2_000,
        maxWaitMs: 10_000
      }),
    []
  )
}
