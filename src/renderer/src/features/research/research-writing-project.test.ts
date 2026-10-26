import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readCatalogManuscript, type WritingProjectScope } from './research-writing-project'

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
  hostId: 'runtime:vip',
  workspaceId: 'streaming-video',
  workspacePath: '/data/projects/StreamingVideo',
  projectId: null,
  name: 'StreamingVideo'
}

describe('project Writing without a research catalog', () => {
  beforeEach(() => {
    calls.catalog.mockReset().mockRejectedValue(new Error('No catalog'))
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
})
