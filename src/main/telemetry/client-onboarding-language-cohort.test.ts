import { afterEach, describe, expect, it, vi } from 'vitest'
import type * as ProductBrandModule from '../../shared/product-brand'
import { _setPostHogClientForTests, initTelemetry, track } from './client'
import { cleanupTelemetryClientTest, setupTelemetryClientTest } from './client-test-harness'

const { capture, brandTelemetry } = vi.hoisted(() => {
  vi.stubGlobal('ORCA_BUILD_IDENTITY', 'stable')
  vi.stubGlobal('ORCA_POSTHOG_WRITE_KEY', 'test-key')
  const brandTelemetry: { host: string | null } = { host: 'https://analytics.example.test' }
  return { capture: vi.fn(), brandTelemetry }
})

vi.mock('../../shared/product-brand', async (importOriginal) => {
  const actual = await importOriginal<typeof ProductBrandModule>()
  const links = {
    ...actual.PRODUCT_BRAND.links,
    get telemetry() {
      return brandTelemetry.host
    }
  }
  return { ...actual, PRODUCT_BRAND: { ...actual.PRODUCT_BRAND, links } }
})

vi.mock('posthog-node', () => ({
  PostHog: class {
    capture = capture
  }
}))

afterEach(() => {
  capture.mockClear()
  brandTelemetry.host = 'https://analytics.example.test'
})

describe('onboarding language cohort on analytics', () => {
  it.each(['control', 'treatment', undefined] as const)(
    'attaches %s to completion and activation events without changing consent',
    (cohort) => {
      const state = setupTelemetryClientTest({
        optedIn: true,
        installId: 'test-install',
        existedBeforeTelemetryRelease: false,
        ...(cohort ? { onboardingLanguageCohort: cohort } : {})
      })
      try {
        initTelemetry(state.store)
        track('onboarding_completed', { path: 'open_folder', total_duration_ms: 1000 })
        track('activation_checklist_item_completed', {
          item: 'ranFirstAgent',
          time_since_completed_ms: 2000
        })
        expect(capture).toHaveBeenCalledTimes(2)
        for (const [event] of capture.mock.calls) {
          expect(event.properties.onboarding_language_v1).toBe(cohort)
        }
        if (state.settings.telemetry) {
          state.settings.telemetry.optedIn = false
        }
        track('app_opened', {})
        expect(capture).toHaveBeenCalledTimes(2)
      } finally {
        cleanupTelemetryClientTest(state.envStash)
      }
    }
  )

  it('never creates a client when the build has no analytics host of its own', () => {
    brandTelemetry.host = null
    const state = setupTelemetryClientTest({
      optedIn: true,
      installId: 'test-install',
      existedBeforeTelemetryRelease: false
    })
    _setPostHogClientForTests(null)
    try {
      initTelemetry(state.store)
      expect(track('app_opened', {})).toBe(false)
      expect(capture).not.toHaveBeenCalled()
    } finally {
      cleanupTelemetryClientTest(state.envStash)
    }
  })
})
