import { describe, expect, it } from 'vitest'
import { catalogRunReference } from './use-research-harness-experiment'

describe('catalog Run references', () => {
  it('recognizes current and legacy record trees on local or Windows paths', () => {
    expect(
      catalogRunReference({ manifestPath: '/project/.aster/experiments/lora/runs/seed-1/run.json' })
    ).toBe('lora/seed-1')
    expect(
      catalogRunReference({
        manifestPath: '/project/research/experiments/lora/runs/seed-2/run.json'
      })
    ).toBe('lora/seed-2')
    expect(
      catalogRunReference({
        manifestPath: 'C:\\project\\.aster\\experiments\\lora\\runs\\seed-3\\run.json'
      })
    ).toBe('lora/seed-3')
  })

  it('does not turn an unrelated manifest into a catalog Run', () => {
    expect(catalogRunReference({ manifestPath: '/project/results/seed-1/run.json' })).toBeNull()
    expect(catalogRunReference({ manifestPath: null })).toBeNull()
  })
})
