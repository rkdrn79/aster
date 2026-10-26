import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  readCatalogManuscript,
  readWritingManuscript,
  type WritingProjectScope
} from './research-writing-project'

const calls = vi.hoisted(() => ({ catalog: vi.fn(), stat: vi.fn() }))
vi.mock('./research-project-catalog', () => ({ readProjectCatalog: calls.catalog }))
vi.mock('./research-writing-source', () => ({
  resolveManuscriptFile: (scope: WritingProjectScope, path: string) => ({
    absolutePath: `${scope.workspacePath}/${path}`,
    relativePath: path
  }),
  statManuscriptSource: calls.stat
}))

const scope: WritingProjectScope = {
  hostId: 'runtime:research',
  workspaceId: 'streaming-video',
  workspacePath: '/data/projects/ExamplePaper',
  projectId: null,
  name: 'ExamplePaper'
}

afterEach(() => vi.unstubAllGlobals())

describe('project Writing without a research catalog', () => {
  beforeEach(() => {
    calls.catalog
      .mockReset()
      .mockRejectedValue(new Error('No research project catalog is available on this host.'))
    calls.stat
      .mockReset()
      .mockImplementation((_owner, file: { relativePath: string }) =>
        file.relativePath === 'paper/main.pdf'
          ? Promise.reject(new Error('ENOENT'))
          : Promise.resolve({ size: 100, mtime: 1 })
      )
  })

  it('finds an existing remote TeX and compiled PDF without organizing the project', async () => {
    expect(await readCatalogManuscript(scope)).toEqual({
      sourcePath: 'paper/main.tex',
      pdfPath: 'paper/build/main.pdf'
    })
  })

  it('keeps the chosen main.tex when a new catalog points at a missing template path', async () => {
    vi.stubGlobal('localStorage', {
      getItem: (key: string) =>
        key === 'aster.research-writing-project-source.v1:runtime:research:streaming-video'
          ? 'main.tex'
          : null
    })
    calls.catalog.mockResolvedValue({
      manuscript: { source: 'paper/main.tex', pdf: 'paper/main.pdf' }
    })
    calls.stat.mockImplementation((_owner, file: { relativePath: string }) =>
      file.relativePath === 'paper/main.tex' || file.relativePath === 'main.pdf'
        ? Promise.reject(new Error('ENOENT'))
        : Promise.resolve({ size: 100, mtime: 1 })
    )

    expect(await readCatalogManuscript(scope)).toEqual({ sourcePath: 'main.tex', pdfPath: null })
  })

  it('keeps a valid Experiment manuscript when its remote catalog still names an old file', async () => {
    calls.catalog.mockResolvedValue({
      manuscript: { source: 'paper/main.tex', pdf: 'paper/main.pdf' }
    })
    const linked = { sourcePath: 'main.tex', pdfPath: 'main.pdf' }

    expect(await readWritingManuscript(scope, linked)).toEqual(linked)
    expect(calls.catalog).not.toHaveBeenCalled()
  })

  it('treats a missing catalog and missing TeX as an unset manuscript', async () => {
    calls.stat.mockRejectedValue(new Error('ENOENT: no such file'))

    expect(await readCatalogManuscript(scope)).toBeUndefined()
  })

  it('reports host and permission errors instead of presenting a missing manuscript', async () => {
    calls.catalog.mockRejectedValue(new Error('The workspace host is unavailable.'))
    await expect(readCatalogManuscript(scope)).rejects.toThrow('host is unavailable')
    expect(calls.stat).not.toHaveBeenCalled()

    calls.catalog.mockRejectedValue(
      new Error('No research project catalog is available on this host.')
    )
    calls.stat.mockRejectedValue(new Error('EACCES: permission denied'))
    await expect(readCatalogManuscript(scope)).rejects.toThrow('permission denied')

    const linked = { sourcePath: 'paper/main.tex', pdfPath: null }
    calls.stat.mockRejectedValue(new Error('The workspace host is unavailable.'))
    await expect(readWritingManuscript(scope, linked)).rejects.toThrow('host is unavailable')
  })
})
