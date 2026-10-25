import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readRuntimeDirectory } from '../../runtime/runtime-file-mutation-client'
import {
  getFileExplorerOperationOwner,
  getFileExplorerOperationRoute
} from '../../components/right-sidebar/file-explorer-operation-owner'
import {
  readWritingFileDirectory,
  visibleWritingFiles,
  writingFileAncestors,
  writingFileEntries,
  writingFileRoot,
  writingFileDepth
} from './research-writing-file-tree'

vi.mock('../../runtime/runtime-file-mutation-client', () => ({ readRuntimeDirectory: vi.fn() }))
vi.mock('../../components/right-sidebar/file-explorer-operation-owner', () => ({
  getFileExplorerOperationOwner: vi.fn(),
  getFileExplorerOperationRoute: vi.fn()
}))

const experiment = {
  hostId: 'local',
  workspaceId: 'folder:paper',
  workspacePath: '/research/paper'
}

describe('Writing TeX file tree', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getFileExplorerOperationOwner).mockReturnValue({ kind: 'local' })
    vi.mocked(getFileExplorerOperationRoute).mockReturnValue({
      target: { kind: 'local' },
      expectedExecutionHostId: 'local'
    })
  })

  it('keeps nested TeX files and folders while excluding other files and symlinks', () => {
    const entries = writingFileEntries(
      [
        { name: 'main.tex', isDirectory: false, isSymlink: false },
        { name: 'sections', isDirectory: true, isSymlink: false },
        { name: 'references.bib', isDirectory: false, isSymlink: false },
        { name: 'unsafe.tex', isDirectory: false, isSymlink: true },
        { name: '..', isDirectory: true, isSymlink: false },
        { name: '.aster', isDirectory: true, isSymlink: false },
        { name: 'node_modules', isDirectory: true, isSymlink: false }
      ],
      experiment.workspacePath,
      experiment.workspacePath
    )
    expect(entries).toEqual(
      expect.arrayContaining([
        { name: 'main.tex', relativePath: 'main.tex', isDirectory: false },
        { name: 'sections', relativePath: 'sections', isDirectory: true }
      ])
    )
    expect(entries).toHaveLength(2)
    expect(writingFileAncestors('sections/methods/ablation.tex')).toEqual([
      'sections',
      'sections/methods'
    ])
    expect(writingFileRoot('research/manuscript/main.tex')).toBe('research/manuscript')
    expect(
      writingFileAncestors('research/manuscript/sections/intro.tex', 'research/manuscript')
    ).toEqual(['research/manuscript/sections'])
  })

  it('shows child files only when their containing folders are expanded', () => {
    const rows = {
      'research/manuscript': [
        { name: 'sections', relativePath: 'research/manuscript/sections', isDirectory: true }
      ],
      'research/manuscript/sections': [
        {
          name: 'result.tex',
          relativePath: 'research/manuscript/sections/result.tex',
          isDirectory: false
        }
      ]
    }
    expect(visibleWritingFiles(rows, new Set(), 'research/manuscript')).toHaveLength(1)
    expect(
      visibleWritingFiles(rows, new Set(['research/manuscript/sections']), 'research/manuscript')
    ).toEqual([rows['research/manuscript'][0], rows['research/manuscript/sections'][0]])
  })

  it('reads a nested folder using the experiment workspace and owner route', async () => {
    vi.mocked(readRuntimeDirectory).mockResolvedValue([
      { name: 'RESULT.TEX', isDirectory: false, isSymlink: false }
    ])
    await expect(readWritingFileDirectory(experiment, 'paper', 'paper/sections')).resolves.toEqual([
      {
        name: 'RESULT.TEX',
        relativePath: 'paper/sections/RESULT.TEX',
        isDirectory: false
      }
    ])
    expect(readRuntimeDirectory).toHaveBeenCalledWith(
      expect.objectContaining({
        target: { kind: 'local' },
        worktreeId: experiment.workspaceId,
        worktreePath: experiment.workspacePath
      }),
      '/research/paper/paper/sections'
    )
  })

  it('does not expose workspace directories when the main TeX file is at the root', async () => {
    vi.mocked(readRuntimeDirectory).mockResolvedValue([
      { name: 'main.tex', isDirectory: false, isSymlink: false },
      { name: 'src', isDirectory: true, isSymlink: false },
      { name: 'research', isDirectory: true, isSymlink: false }
    ])
    await expect(readWritingFileDirectory(experiment, '', '')).resolves.toEqual([
      { name: 'main.tex', relativePath: 'main.tex', isDirectory: false }
    ])
  })

  it('refuses a host mismatch or path outside the workspace before reading', async () => {
    await expect(
      readWritingFileDirectory({ ...experiment, hostId: 'ssh:another-host' }, 'paper', 'paper')
    ).rejects.toThrow('host is unavailable or has changed')
    await expect(readWritingFileDirectory(experiment, 'paper', '../private')).rejects.toThrow(
      'inside the manuscript directory'
    )
    await expect(readWritingFileDirectory(experiment, 'paper', 'experiments')).rejects.toThrow(
      'inside the manuscript directory'
    )
    expect(readRuntimeDirectory).not.toHaveBeenCalled()
  })
})

describe('writingFileDepth', () => {
  it('indents from the manuscript folder, not the workspace root', () => {
    expect(writingFileDepth('research/manuscript/main.tex', 'research/manuscript')).toBe(0)
    expect(writingFileDepth('research/manuscript/sections/intro.tex', 'research/manuscript')).toBe(
      1
    )
    expect(writingFileDepth('main.tex', '')).toBe(0)
  })
})
