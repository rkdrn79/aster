// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Stored = string | Uint8Array
const files = vi.hoisted(() => new Map<string, Stored>())

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }))
vi.mock('./research-figure-preview', () => ({ readFigurePreviewHash: vi.fn(async () => null) }))
vi.mock('./research-figure-overwrite', () => ({ editorFor: vi.fn(async () => null) }))
vi.mock('./research-figures-store', () => ({ selectFigure: vi.fn() }))
vi.mock('./research-figure-editor-handle', () => ({
  useFigureEditorHandle: { getState: () => ({ handle: null }) }
}))
vi.mock('./research-project-files', () => {
  const missing = (path: string) => new Error(`ENOENT: ${path}`)
  const textOf = (value: Stored) =>
    typeof value === 'string' ? value : new TextDecoder().decode(value)
  return {
    ProjectWriteConflict: class extends Error {},
    isMissingProjectFile: (error: unknown) => /ENOENT/.test(String(error)),
    base64ToBytes: (content: string) => Uint8Array.from(atob(content), (c) => c.charCodeAt(0)),
    projectRecordRoot: async () => '.aster',
    projectAbsolutePath: (_owner: unknown, path: string) => `/p/${path}`,
    readProjectText: async (_owner: unknown, path: string) => {
      const value = files.get(path)
      if (value === undefined) {
        throw missing(path)
      }
      return textOf(value)
    },
    readProjectFile: async (_owner: unknown, path: string) => {
      const value = files.get(path)
      if (value === undefined) {
        throw missing(path)
      }
      return typeof value === 'string'
        ? { isBinary: false, content: value }
        : {
            isBinary: true,
            content: btoa(String.fromCharCode(...value)),
            mimeType: 'application/pdf'
          }
    },
    writeProjectText: async (_owner: unknown, path: string, text: string) => {
      files.set(path, text)
    },
    writeProjectBinary: async (_owner: unknown, path: string, bytes: Uint8Array) => {
      files.set(path, bytes)
    },
    deleteProjectPath: async (_owner: unknown, path: string) => {
      files.delete(path)
    },
    moveProjectPath: async (_owner: unknown, from: string, to: string) => {
      const value = files.get(from)
      if (value === undefined) {
        throw missing(from)
      }
      files.delete(from)
      files.set(to, value)
    },
    listProjectDirectory: async (_owner: unknown, folder: string) => {
      const names = [...files.keys()]
        .filter((path) => path.startsWith(`${folder}/`))
        .map((path) => path.slice(folder.length + 1))
        .filter((name) => !name.includes('/'))
      return names.length ? names.map((name) => ({ name, isDirectory: false })) : null
    }
  }
})

import {
  FigurePublishConflict,
  publishFigureCopy,
  publishListedFigure,
  renamePublishedCopy
} from './research-figure-publish'
import { readFigurePreviewHash } from './research-figure-preview'
import { editorFor } from './research-figure-overwrite'
import { selectFigure } from './research-figures-store'
import { sceneSha256 } from './research-figure-document'

const owner = { hostId: 'local', workspaceId: 'wt', workspacePath: '/p' }
const encode = (text: string) => new TextEncoder().encode(text)
const read = (path: string) => {
  const value = files.get(path)
  return typeof value === 'string' ? value : value ? new TextDecoder().decode(value) : undefined
}
const publish = (replace = false) =>
  publishFigureCopy({
    owner,
    slug: 'method',
    from: '.aster/figures/method.pdf',
    manuscript: 'paper/main.tex',
    sceneSha256: 'scene-1',
    replace
  })

beforeEach(() => {
  files.clear()
  files.set('.aster/figures/method.pdf', encode('%PDF-one'))
})

describe('publishing a figure', () => {
  it('copies the PDF next to the manuscript and records what it was made from', async () => {
    const result = await publish()
    expect(result.pdf).toBe('paper/figures/method.pdf')
    expect(read('paper/figures/method.pdf')).toBe('%PDF-one')
    expect([...files.keys()].filter((path) => path.startsWith('paper/'))).toEqual([
      'paper/figures/method.pdf'
    ])
    const record = JSON.parse(read('.aster/figures/published/method.json') ?? '{}')
    expect(record).toMatchObject({
      slug: 'method',
      pdf: 'paper/figures/method.pdf',
      sceneSha256: 'scene-1'
    })
    expect(record.pdfSha256).toHaveLength(64)
  })

  it('replaces its own copy without asking, and undo puts the old one back', async () => {
    await publish()
    files.set('.aster/figures/method.pdf', encode('%PDF-two'))
    const again = await publishFigureCopy({
      owner,
      slug: 'method',
      from: '.aster/figures/method.pdf',
      manuscript: 'paper/main.tex',
      sceneSha256: 'scene-2'
    })
    expect(read('paper/figures/method.pdf')).toBe('%PDF-two')
    expect(JSON.parse(read('.aster/figures/published/method.json') ?? '{}').sceneSha256).toBe(
      'scene-2'
    )
    await again.undo()
    expect(read('paper/figures/method.pdf')).toBe('%PDF-one')
    expect(JSON.parse(read('.aster/figures/published/method.json') ?? '{}').sceneSha256).toBe(
      'scene-1'
    )
  })

  it('removes the copy when the first publish is undone', async () => {
    const first = await publish()
    await first.undo()
    expect(files.has('paper/figures/method.pdf')).toBe(false)
    expect(files.has('.aster/figures/published/method.json')).toBe(false)
  })

  it('refuses a PDF already there that it did not write, until told to replace it', async () => {
    files.set('paper/figures/method.pdf', encode('%PDF-theirs'))
    await expect(publish()).rejects.toBeInstanceOf(FigurePublishConflict)
    expect(read('paper/figures/method.pdf')).toBe('%PDF-theirs')
    await publish(true)
    expect(read('paper/figures/method.pdf')).toBe('%PDF-one')
  })

  it('takes over an identical PDF without asking', async () => {
    files.set('paper/figures/method.pdf', encode('%PDF-one'))
    await expect(publish()).resolves.toMatchObject({ pdf: 'paper/figures/method.pdf' })
  })

  it('says when the figure has not been exported yet', async () => {
    files.delete('.aster/figures/method.pdf')
    await expect(publish()).rejects.toThrow(/has not been written/)
  })

  it('publishes a listed figure at once when its PDF shows the scene on disk', async () => {
    files.set('.aster/figures/method.excalidraw', '{"elements":[]}')
    vi.mocked(readFigurePreviewHash).mockResolvedValueOnce(await sceneSha256('{"elements":[]}'))
    await publishListedFigure(owner, { folder: '.aster/figures', slug: 'method' }, 'paper/main.tex')
    expect(read('paper/figures/method.pdf')).toBe('%PDF-one')
    expect(selectFigure).not.toHaveBeenCalled()
  })

  it('opens a listed figure whose PDF lags behind, and reports when it will not open', async () => {
    files.set('.aster/figures/method.excalidraw', '{"elements":[]}')
    await expect(
      publishListedFigure(owner, { folder: '.aster/figures', slug: 'method' }, 'paper/main.tex')
    ).rejects.toThrow(/did not open/)
    expect(selectFigure).toHaveBeenCalledWith(owner, { kind: 'figure', slug: 'method' })
    expect(editorFor).toHaveBeenCalledWith('method')
    expect(files.has('paper/figures/method.pdf')).toBe(false)
  })

  it('renames the copy and record with the figure when the manuscript follows', async () => {
    await publish()
    await renamePublishedCopy(owner, {
      from: 'method',
      to: 'overview',
      manuscript: 'paper/main.tex',
      follow: true
    })
    expect(read('paper/figures/method.pdf')).toBeUndefined()
    expect(read('paper/figures/overview.pdf')).toBe('%PDF-one')
    expect(files.has('.aster/figures/published/method.json')).toBe(false)
    expect(JSON.parse(read('.aster/figures/published/overview.json') ?? '{}')).toMatchObject({
      slug: 'overview',
      pdf: 'paper/figures/overview.pdf'
    })
  })

  it('leaves the copy under its old name when the manuscript keeps that name', async () => {
    await publish()
    await renamePublishedCopy(owner, {
      from: 'method',
      to: 'overview',
      manuscript: 'paper/main.tex',
      follow: false
    })
    expect(read('paper/figures/method.pdf')).toBe('%PDF-one')
    expect(files.has('.aster/figures/published/method.json')).toBe(false)
    expect(files.has('.aster/figures/published/overview.json')).toBe(false)
  })

  it('stops a rename whose new name is taken in the paper', async () => {
    await publish()
    files.set('paper/figures/overview.pdf', encode('%PDF-hand'))
    await expect(
      renamePublishedCopy(owner, {
        from: 'method',
        to: 'overview',
        manuscript: 'paper/main.tex',
        follow: true
      })
    ).rejects.toThrow(/already exists/)
    expect(read('paper/figures/method.pdf')).toBe('%PDF-one')
    expect(read('paper/figures/overview.pdf')).toBe('%PDF-hand')
  })
})
