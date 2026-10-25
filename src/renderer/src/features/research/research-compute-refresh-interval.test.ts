// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_COMPUTE_REFRESH_INTERVAL_MS,
  readComputeRefreshInterval,
  writeComputeRefreshInterval
} from './research-compute-refresh-interval'

afterEach(() => localStorage.clear())

describe('Compute refresh interval', () => {
  it('defaults to 30 seconds and remembers an offered choice, including off', () => {
    expect(readComputeRefreshInterval()).toBe(DEFAULT_COMPUTE_REFRESH_INTERVAL_MS)
    writeComputeRefreshInterval(300_000)
    expect(readComputeRefreshInterval()).toBe(300_000)
    writeComputeRefreshInterval(0)
    expect(readComputeRefreshInterval()).toBe(0)
  })

  it('ignores intervals the menu does not offer so a stored value cannot poll the cluster hard', () => {
    writeComputeRefreshInterval(1_000)
    expect(readComputeRefreshInterval()).toBe(DEFAULT_COMPUTE_REFRESH_INTERVAL_MS)
    localStorage.setItem('aster.research.compute.refreshIntervalMs', '500')
    expect(readComputeRefreshInterval()).toBe(DEFAULT_COMPUTE_REFRESH_INTERVAL_MS)
    localStorage.setItem('aster.research.compute.refreshIntervalMs', 'soon')
    expect(readComputeRefreshInterval()).toBe(DEFAULT_COMPUTE_REFRESH_INTERVAL_MS)
  })
})
