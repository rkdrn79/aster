import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExperimentRecord } from '../../../../shared/research/research-records'
import { MAX_FILE_RANGE_READ_BYTES } from '../../../../shared/file-range-read'
import {
  isWritingTeXFile,
  readManuscriptPdf,
  resolveManuscriptFile
} from './research-writing-source'

const fileRead = vi.hoisted(() => ({
  stat: vi.fn(),
  range: vi.fn()
}))

vi.mock('@/runtime/runtime-client-target', () => ({
  runtimeRpcTargetForAuthorityKey: () => ({ kind: 'local' })
}))

vi.mock('@/runtime/runtime-file-range-client', () => ({
  statRuntimeReadTarget: fileRead.stat,
  readRuntimeFileRange: fileRead.range
}))

const experiment: ExperimentRecord = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Paper',
  projectId: null,
  workspaceId: 'workspace',
  workspacePath: '/research/project',
  hostId: 'local',
  archived: false,
  createdAt: '2026-10-23T00:00:00Z',
  updatedAt: '2026-10-23T00:00:00Z'
}

describe('manuscript file boundary', () => {
  beforeEach(() => {
    fileRead.stat.mockReset()
    fileRead.range.mockReset()
  })

  it('normalizes an approved local picker path to a workspace-relative manuscript path', () => {
    expect(resolveManuscriptFile(experiment, '/research/project/paper/main.tex', '.tex')).toEqual({
      absolutePath: '/research/project/paper/main.tex',
      relativePath: 'paper/main.tex'
    })
    expect(resolveManuscriptFile(experiment, 'paper/main.pdf', '.pdf').relativePath).toBe(
      'paper/main.pdf'
    )
  })

  it('refuses traversal, another workspace, and the wrong file kind', () => {
    expect(() => resolveManuscriptFile(experiment, '../secret.tex', '.tex')).toThrow('inside')
    expect(() => resolveManuscriptFile(experiment, '/another/main.tex', '.tex')).toThrow('inside')
    expect(() => resolveManuscriptFile(experiment, 'paper/main.md', '.tex')).toThrow('.tex')
  })

  it('offers Writing revision for every TeX file in the linked workspace', () => {
    const manuscriptExperiment = {
      ...experiment,
      manuscript: { sourcePath: 'paper/main.tex', pdfPath: null }
    }
    expect(
      isWritingTeXFile(
        manuscriptExperiment,
        'workspace',
        '/research/project/paper/main.tex',
        'paper/main.tex'
      )
    ).toBe(true)
    expect(
      isWritingTeXFile(
        manuscriptExperiment,
        'workspace',
        '/research/project/paper/section.tex',
        'paper/section.tex'
      )
    ).toBe(true)
    expect(
      isWritingTeXFile(
        manuscriptExperiment,
        'another-workspace',
        '/research/project/paper/section.tex',
        'paper/section.tex'
      )
    ).toBe(false)
    expect(
      isWritingTeXFile(
        manuscriptExperiment,
        'workspace',
        '/research/project/paper/notes.md',
        'paper/notes.md'
      )
    ).toBe(false)
  })

  it('preserves PDF bytes exactly for the existing viewer', async () => {
    const bytes = Uint8Array.from([...new TextEncoder().encode('%PDF-1.4\n'), 0, 0x7f, 0xff])
    fileRead.stat.mockResolvedValue({ size: bytes.length, mtime: 42, isDirectory: false })
    fileRead.range.mockResolvedValue(bytes)

    const pdf = await readManuscriptPdf(
      experiment,
      resolveManuscriptFile(experiment, 'paper/main.pdf', '.pdf')
    )

    expect(Uint8Array.from(atob(pdf.base64), (character) => character.charCodeAt(0))).toEqual(bytes)
    expect(pdf.mtime).toBe(42)
    expect(fileRead.range).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath: '/research/project/paper/main.pdf',
        relativePath: 'paper/main.pdf',
        access: { kind: 'research-workspace', workspacePath: '/research/project' }
      }),
      0,
      bytes.length
    )
  })

  it('reads a multi-chunk PDF with at most two in-flight ranges', async () => {
    const bytes = new Uint8Array(MAX_FILE_RANGE_READ_BYTES * 2 + 17)
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = index % 251
    }
    bytes.set(new TextEncoder().encode('%PDF-1.4'))
    fileRead.stat.mockResolvedValue({ size: bytes.length, mtime: 42, isDirectory: false })
    let inFlight = 0
    let maxInFlight = 0
    fileRead.range.mockImplementation(async (_args: unknown, offset: number, length: number) => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise<void>((resolve) => setTimeout(resolve, 1))
      inFlight -= 1
      return bytes.slice(offset, offset + length)
    })

    const pdf = await readManuscriptPdf(
      experiment,
      resolveManuscriptFile(experiment, 'paper/main.pdf', '.pdf')
    )

    expect(maxInFlight).toBe(2)
    expect(fileRead.range).toHaveBeenCalledTimes(3)
    expect(Uint8Array.from(atob(pdf.base64), (character) => character.charCodeAt(0))).toEqual(bytes)
  })
})
