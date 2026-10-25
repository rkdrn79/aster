import { describe, expect, it, vi } from 'vitest'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import {
  catalogRuns,
  catalogWorkspacePath,
  parseProjectCatalog,
  parseProjectCatalogValue,
  readProjectCatalog
} from './research-project-catalog'

vi.mock('@/runtime/runtime-rpc-client', () => ({ callRuntimeRpc: vi.fn() }))

const workspace = '/tmp/research-project'
const project = {
  schemaVersion: 1,
  manuscript: {
    source: 'research/manuscript/main.tex',
    pdf: 'research/manuscript/main.pdf'
  },
  experiments: [
    {
      slug: 'lora-r16',
      name: 'LoRA rank 16',
      path: 'research/experiments/lora-r16',
      runs: [
        {
          id: 'run-001',
          name: 'seed 42',
          manifest: 'research/experiments/lora-r16/runs/run-001/run.json',
          metrics: 'research/experiments/lora-r16/runs/run-001/metrics.jsonl',
          log: 'research/experiments/lora-r16/runs/run-001/train.log',
          config: null
        }
      ]
    }
  ]
}

describe('project catalog', () => {
  it('resolves explicit run and manuscript paths inside the workspace', () => {
    const parsed = parseProjectCatalog(JSON.stringify(project), workspace)
    expect(catalogRuns(parsed)).toHaveLength(1)
    expect(catalogRuns(parsed)[0]?.experimentName).toBe('LoRA rank 16')
    expect(catalogWorkspacePath(workspace, parsed.manuscript.source)).toBe(
      '/tmp/research-project/research/manuscript/main.tex'
    )
  })

  it('rejects traversal and absolute paths from an untrusted catalog', () => {
    for (const path of [
      '../secret.tex',
      '/etc/passwd',
      'research/../../secret.tex',
      'C:\\secret.tex'
    ]) {
      const bad = structuredClone(project)
      bad.manuscript.source = path
      expect(() => parseProjectCatalog(JSON.stringify(bad), workspace)).toThrow()
    }
  })

  it('reads an .aster catalog whose manuscript lives outside the record tree', () => {
    const aster = JSON.parse(
      JSON.stringify(project).replaceAll('research/experiments/', '.aster/experiments/')
    )
    aster.schemaVersion = 2
    aster.manuscript = { source: 'paper/main.tex', pdf: 'paper/main.pdf' }
    const parsed = parseProjectCatalogValue(aster, workspace)
    expect(catalogWorkspacePath(workspace, parsed.manuscript.source)).toBe(
      '/tmp/research-project/paper/main.tex'
    )
    expect(catalogRuns(parsed)[0]?.manifest).toBe(
      '.aster/experiments/lora-r16/runs/run-001/run.json'
    )
  })

  it('keeps Run files inside a record tree even when the manuscript may be anywhere', () => {
    const bad = structuredClone(project)
    bad.experiments[0].runs[0].metrics = 'src/metrics.jsonl'
    expect(() => parseProjectCatalog(JSON.stringify(bad), workspace)).toThrow(/record folder/)
  })

  it('does not accept unsupported result paths as a Run', () => {
    const bad = structuredClone(project)
    bad.experiments[0].runs[0].metrics = 'research/experiments/lora-r16/runs/run-001/train.log'
    expect(() => parseProjectCatalog(JSON.stringify(bad), workspace)).toThrow()
  })

  it('reads a runtime host catalog through its project RPC', async () => {
    const aster = JSON.parse(
      JSON.stringify(project).replaceAll('research/experiments/', '.aster/experiments/')
    )
    aster.schemaVersion = 2
    aster.manuscript = { source: 'paper/main.tex', pdf: 'paper/main.pdf' }
    vi.mocked(callRuntimeRpc).mockResolvedValue({
      version: 1,
      catalog: { status: 'present', value: aster }
    })
    vi.stubGlobal('window', { api: { researchProjectLayout: {} } })
    try {
      const catalog = await readProjectCatalog({
        hostId: 'runtime:example',
        workspaceId: 'worktree-1',
        workspacePath: workspace
      })
      expect(catalog.schemaVersion).toBe(2)
      expect(callRuntimeRpc).toHaveBeenCalledWith(
        { kind: 'environment', environmentId: 'example' },
        'researchProject.read',
        { worktree: 'id:worktree-1' }
      )
    } finally {
      vi.unstubAllGlobals()
      vi.mocked(callRuntimeRpc).mockReset()
    }
  })
})
