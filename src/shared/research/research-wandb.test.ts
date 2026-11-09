import { describe, expect, it } from 'vitest'
import { researchProjectCatalogSchema } from './research-project-api'
import { researchRunManifestSchema } from './research-run-manifest'
import {
  catalogTextWithWandb,
  wandbGroupUrl,
  wandbNameProblem,
  wandbProjectSlug,
  wandbRunUrl,
  type ResearchProjectWandb,
  type ResearchRunWandb
} from './research-wandb'

const catalog = {
  schemaVersion: 2,
  manuscript: { source: 'paper/main.tex', pdf: 'paper/main.pdf' },
  references: { bibliography: 'paper/references.bib', papers: '.aster/library/papers' },
  experiments: []
}
const enabled: ResearchProjectWandb = {
  enabled: true,
  entity: 'PoV_JEPA',
  project: 'reusable-jepa',
  python: null
}
const record: ResearchRunWandb = {
  entity: 'PoV_JEPA',
  project: 'reusable-jepa',
  group: 'main',
  runId: 'aster-0123456789abcdef',
  url: null,
  status: 'synced'
}

describe('catalog wandb section', () => {
  it('keeps validating catalogs written before W&B mirroring', () => {
    const parsed = researchProjectCatalogSchema.parse(catalog)
    expect(parsed.wandb).toBeUndefined()
    expect(parsed.experiments).toEqual([])
  })

  it('carries an enabled section and drops a malformed one without hiding the catalog', () => {
    expect(
      researchProjectCatalogSchema.parse({
        ...catalog,
        wandb: { enabled: true, entity: 'PoV_JEPA', project: 'reusable-jepa' }
      }).wandb
    ).toEqual({ enabled: true, entity: 'PoV_JEPA', project: 'reusable-jepa' })
    expect(researchProjectCatalogSchema.parse({ ...catalog, wandb: 'on' }).wandb).toBeNull()
    expect(
      researchProjectCatalogSchema.parse({ ...catalog, wandb: { enabled: 'yes', project: 7 } })
        .wandb
    ).toEqual({ enabled: false, project: null })
  })

  it('reads the mirror record from run.json and ignores a malformed one', () => {
    const manifest = { schemaVersion: 1, externalRunId: 'seed-1' }
    expect(researchRunManifestSchema.parse({ ...manifest, wandb: record }).wandb).toEqual(record)
    expect(researchRunManifestSchema.parse({ ...manifest, wandb: { runId: 3 } }).wandb).toBe(
      undefined
    )
    expect(researchRunManifestSchema.parse(manifest).wandb).toBeUndefined()
  })
})

describe('W&B names', () => {
  it('rejects names W&B would refuse', () => {
    expect(wandbNameProblem('PoV_JEPA', 'Entity')).toBeNull()
    expect(wandbNameProblem('  ', 'Entity')).toBe('Entity is required.')
    expect(wandbNameProblem('a/b', 'W&B project')).toMatch(/cannot contain/)
    expect(wandbNameProblem('my project', 'W&B project')).toMatch(/cannot contain/)
  })

  it('suggests a project name from the Aster project name', () => {
    expect(wandbProjectSlug('Reusable JEPA (v2)')).toBe('reusable-jepa-v2')
    expect(wandbProjectSlug('한국어')).toBe('')
  })
})

describe('W&B links', () => {
  it('opens the Experiment as a W&B group only when enabled with an entity', () => {
    expect(wandbGroupUrl(enabled, 'lora-r16')).toBe(
      'https://wandb.ai/PoV_JEPA/reusable-jepa/groups/lora-r16'
    )
    expect(wandbGroupUrl({ ...enabled, enabled: false }, 'lora-r16')).toBeNull()
    expect(wandbGroupUrl({ ...enabled, entity: null }, 'lora-r16')).toBeNull()
    expect(wandbGroupUrl(null, 'lora-r16')).toBeNull()
  })

  it('opens the Run at the reported URL, else the one its record names', () => {
    const reported = 'https://wandb.ai/pov/reusable-jepa/runs/aster-0123456789abcdef'
    expect(wandbRunUrl(enabled, { ...record, url: reported })).toBe(reported)
    expect(wandbRunUrl(enabled, record)).toBe(
      'https://wandb.ai/PoV_JEPA/reusable-jepa/runs/aster-0123456789abcdef'
    )
    expect(wandbRunUrl(enabled, { ...record, url: 'https://evil.example/x' })).toBe(
      'https://wandb.ai/PoV_JEPA/reusable-jepa/runs/aster-0123456789abcdef'
    )
    expect(wandbRunUrl({ ...enabled, enabled: false }, record)).toBeNull()
    expect(wandbRunUrl(enabled, { ...record, status: 'failed' })).toBeNull()
    expect(wandbRunUrl({ ...enabled, entity: null }, { ...record, entity: null })).toBeNull()
    expect(wandbRunUrl(enabled, null)).toBeNull()
  })
})

describe('catalogTextWithWandb', () => {
  it('replaces only the wandb section and keeps the file shape', () => {
    const text = `${JSON.stringify({ ...catalog, custom: { keep: true } }, null, 2)}\n`
    const next = catalogTextWithWandb(text, {
      enabled: true,
      entity: ' PoV_JEPA ',
      project: 'reusable-jepa',
      python: null
    })
    expect(next.endsWith('}\n')).toBe(true)
    expect(JSON.parse(next)).toEqual({
      ...catalog,
      custom: { keep: true },
      wandb: { enabled: true, entity: 'PoV_JEPA', project: 'reusable-jepa' }
    })
    expect(
      JSON.parse(catalogTextWithWandb(next, { enabled: false, entity: null, project: 'p' })).wandb
    ).toEqual({ enabled: false, project: 'p' })
  })

  it('refuses a catalog that is not a JSON object', () => {
    expect(() => catalogTextWithWandb('[]', enabled)).toThrow(/not a JSON object/)
  })
})
