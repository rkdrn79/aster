// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import {
  emptyResearchDocument,
  type ExperimentRecord,
  type ResearchDocument
} from '../../../../shared/research/research-records'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  localCompile: vi.fn(),
  update: vi.fn(),
  document: vi.fn()
}))

vi.mock('@/lib/browser-uuid', () => ({ createBrowserUuid: () => 'build-1' }))
vi.mock('@/runtime/runtime-client-target', () => ({
  runtimeRpcTargetForAuthorityKey: () => ({ kind: 'test' })
}))
vi.mock('@/runtime/runtime-rpc-client', () => ({ callRuntimeRpc: mocks.rpc }))
vi.mock('./research-records-store', () => ({
  useResearchRecords: {
    getState: () => ({ update: mocks.update, document: mocks.document() })
  }
}))

import { useWritingCompile } from './research-writing-compile'

const record: ExperimentRecord = {
  id: 'experiment-1',
  name: 'ExamplePaper',
  projectId: null,
  workspaceId: 'streaming-video',
  workspacePath: '/data/projects/ExamplePaper',
  hostId: 'runtime:research',
  archived: false,
  createdAt: '2026-10-26T00:00:00Z',
  updatedAt: '2026-10-26T00:00:00Z'
}
const rootFile = {
  absolutePath: '/data/projects/ExamplePaper/main.tex',
  relativePath: 'main.tex'
}

afterEach(() => {
  cleanup()
  mocks.rpc.mockReset()
  mocks.localCompile.mockReset()
  mocks.update.mockReset()
  mocks.document.mockReset()
  vi.unstubAllGlobals()
})

it('records a remote PDF build on active Experiments missing the project manuscript', async () => {
  let document: ResearchDocument = {
    ...emptyResearchDocument(),
    experiments: [
      record,
      { ...record, id: 'experiment-2', manuscript: { sourcePath: 'main.tex', pdfPath: null } },
      { ...record, id: 'other-paper', manuscript: { sourcePath: 'draft.tex', pdfPath: null } },
      { ...record, id: 'archived', archived: true },
      { ...record, id: 'other-host', hostId: 'local' },
      { ...record, id: 'other-workspace', workspaceId: 'another-project' }
    ]
  }
  mocks.update.mockImplementation(
    async (change: (current: ResearchDocument) => ResearchDocument) => {
      document = change(document)
    }
  )
  mocks.document.mockImplementation(() => document)
  mocks.rpc.mockResolvedValue({
    status: 'ok',
    pdfPath: '/data/projects/ExamplePaper/build/main.pdf',
    builtAt: '2026-10-26T01:00:00Z',
    output: 'Build complete'
  })
  vi.stubGlobal('api', { researchLatex: { compile: mocks.localCompile } })
  const onBuilt = vi.fn()
  const hook = renderHook(() =>
    useWritingCompile({
      record,
      projectOnly: false,
      rootFile,
      dirtyTeXFiles: 0,
      onBuilt
    })
  )

  await act(async () => hook.result.current.compile())

  expect(hook.result.current.error).toBeNull()
  expect(onBuilt).toHaveBeenCalledOnce()
  expect(document.experiments.map((experiment) => experiment.manuscript)).toEqual([
    { sourcePath: 'main.tex', pdfPath: 'build/main.pdf' },
    { sourcePath: 'main.tex', pdfPath: 'build/main.pdf' },
    { sourcePath: 'draft.tex', pdfPath: null },
    undefined,
    undefined,
    undefined
  ])
})

function attachSavedExperiment(experiment: ExperimentRecord): () => ExperimentRecord {
  let document: ResearchDocument = {
    ...emptyResearchDocument(),
    experiments: [experiment]
  }
  mocks.document.mockImplementation(() => document)
  mocks.update.mockImplementation(
    async (change: (current: ResearchDocument) => ResearchDocument) => {
      document = change(document)
    }
  )
  mocks.localCompile.mockResolvedValue({
    status: 'ok',
    pdfPath: '/data/projects/ExamplePaper/build/main.pdf',
    builtAt: '2026-10-26T01:00:00Z',
    output: 'Build complete'
  })
  vi.stubGlobal('api', { researchLatex: { compile: mocks.localCompile } })
  return () => document.experiments[0]
}

it('compiles a local fallback manuscript by path when the first Experiment has no manuscript', async () => {
  const localRecord = { ...record, hostId: 'local' }
  const saved = attachSavedExperiment(localRecord)
  const hook = renderHook(() =>
    useWritingCompile({
      record: { ...localRecord, manuscript: { sourcePath: 'main.tex', pdfPath: null } },
      projectOnly: false,
      rootFile,
      dirtyTeXFiles: 0,
      onBuilt: vi.fn()
    })
  )

  await act(async () => hook.result.current.compile())

  expect(hook.result.current.error).toBeNull()
  expect(mocks.localCompile).toHaveBeenCalledWith({
    workspacePath: localRecord.workspacePath,
    sourcePath: 'main.tex',
    buildId: 'build-1'
  })
  expect(saved().manuscript).toEqual({ sourcePath: 'main.tex', pdfPath: 'build/main.pdf' })
})

it('keeps Experiment-based local compilation when its manuscript is already saved', async () => {
  const localRecord = {
    ...record,
    hostId: 'local',
    manuscript: { sourcePath: 'main.tex', pdfPath: null }
  }
  const saved = attachSavedExperiment(localRecord)
  const hook = renderHook(() =>
    useWritingCompile({
      record: localRecord,
      projectOnly: false,
      rootFile,
      dirtyTeXFiles: 0,
      onBuilt: vi.fn()
    })
  )

  await act(async () => hook.result.current.compile())

  expect(hook.result.current.error).toBeNull()
  expect(mocks.localCompile).toHaveBeenCalledWith({
    experimentId: localRecord.id,
    buildId: 'build-1'
  })
  expect(saved().manuscript?.pdfPath).toBe('build/main.pdf')
})
