// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Stored = string | Uint8Array
const files = vi.hoisted(() => new Map<string, Stored>())

vi.mock('@/store', () => ({ useAppStore: { getState: vi.fn() } }))
vi.mock('@/lib/language-detect', () => ({ detectLanguage: () => 'plaintext' }))
vi.mock('@/lib/reveal-in-file-manager', () => ({ revealInFileManager: vi.fn() }))
vi.mock('./research-navigation', () => ({ openResearchView: vi.fn() }))
vi.mock('./research-figure-history', () => ({ moveFigureHistory: vi.fn(async () => undefined) }))
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
        : { isBinary: true, content: btoa(String.fromCharCode(...value)) }
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

import { sceneSha256 } from './research-figure-document'
import {
  adoptFigure,
  renameFigure,
  restoreFigure,
  trashFigure
} from './research-figure-file-actions'

const owner = { hostId: 'local', workspaceId: 'wt', workspacePath: '/p' }
const work = { folder: '.aster/figures', slug: 'method' }
const scene = '{"elements":[]}'
const record = (slug = 'method') =>
  JSON.stringify({
    slug,
    pdf: `paper/figures/${slug}.pdf`,
    pdfSha256: 'p',
    sceneSha256: 's',
    publishedAt: 'now'
  })

function published(): void {
  files.set('.aster/figures/method.excalidraw', scene)
  files.set('.aster/figures/method.svg', '<svg/>')
  files.set('.aster/figures/method.pdf', '%PDF-work')
  files.set('.aster/figures/published/method.json', record())
  files.set('paper/figures/method.pdf', '%PDF-paper')
  files.set('paper/main.tex', '\\includegraphics{figures/method.pdf}\n')
}

beforeEach(() => {
  files.clear()
})

describe('renaming and deleting a published figure', () => {
  it('renames the paper copy and the manuscript line with the figure', async () => {
    published()
    const updated = await renameFigure(owner, work, {
      slug: 'overview',
      title: null,
      manuscript: 'paper/main.tex',
      published: 'paper/main.tex'
    })
    expect(updated).toBe(1)
    expect(files.has('.aster/figures/overview.excalidraw')).toBe(true)
    expect(files.has('paper/figures/method.pdf')).toBe(false)
    expect(files.get('paper/figures/overview.pdf')).toBe('%PDF-paper')
    expect(JSON.parse(String(files.get('.aster/figures/published/overview.json')))).toMatchObject({
      slug: 'overview',
      pdf: 'paper/figures/overview.pdf'
    })
    expect(files.get('paper/main.tex')).toBe('\\includegraphics{figures/overview.pdf}\n')
  })

  it('keeps a current paper copy current when only the title changes', async () => {
    const page = {
      id: 'figure-page',
      type: 'frame',
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      customData: { asterPage: { widthIn: 1, heightIn: 1 } }
    }
    const text = JSON.stringify({ elements: [page] })
    published()
    files.set('.aster/figures/method.excalidraw', text)
    const stored = JSON.parse(String(files.get('.aster/figures/published/method.json')))
    stored.sceneSha256 = await sceneSha256(text)
    files.set('.aster/figures/published/method.json', JSON.stringify(stored))
    await renameFigure(owner, work, {
      slug: 'method',
      title: 'Nice title',
      manuscript: null,
      published: 'paper/main.tex'
    })
    const after = String(files.get('.aster/figures/method.excalidraw'))
    expect(after).toContain('Nice title')
    expect(JSON.parse(String(files.get('.aster/figures/published/method.json'))).sceneSha256).toBe(
      await sceneSha256(after)
    )
    expect(files.get('paper/figures/method.pdf')).toBe('%PDF-paper')
  })

  it('leaves the paper copy under the old name when the manuscript keeps that line', async () => {
    published()
    await renameFigure(owner, work, {
      slug: 'overview',
      title: null,
      manuscript: null,
      published: 'paper/main.tex'
    })
    expect(files.get('paper/figures/method.pdf')).toBe('%PDF-paper')
    expect(files.has('paper/figures/overview.pdf')).toBe(false)
    expect(files.has('.aster/figures/published/method.json')).toBe(false)
    expect(files.get('paper/main.tex')).toContain('figures/method.pdf')
  })

  it('never takes the paper copy on delete unless asked, and undo restores it all', async () => {
    published()
    const moves = await trashFigure(owner, work)
    expect(files.has('paper/figures/method.pdf')).toBe(true)
    expect(files.has('.aster/figures/method.excalidraw')).toBe(false)
    expect(files.has('.aster/figures/published/method.json')).toBe(false)
    await restoreFigure(owner, moves)
    expect(files.has('.aster/figures/method.excalidraw')).toBe(true)
    expect(files.has('.aster/figures/published/method.json')).toBe(true)

    const asked = await trashFigure(owner, work, 'paper/figures/method.pdf')
    expect(files.has('paper/figures/method.pdf')).toBe(false)
    await restoreFigure(owner, asked)
    expect(files.get('paper/figures/method.pdf')).toBe('%PDF-paper')
  })

  it('leaves an older figure working where it is: its PDF moves only with it', async () => {
    files.set('paper/figures/old.excalidraw', scene)
    files.set('paper/figures/old.pdf', '%PDF-old')
    const moves = await trashFigure(owner, { folder: 'paper/figures', slug: 'old' })
    expect(moves.map((move) => move.from).toSorted()).toEqual([
      'paper/figures/old.excalidraw',
      'paper/figures/old.pdf'
    ])
  })
})

describe('moving an older figure into the working folder', () => {
  it('moves its sources, keeps the paper PDF and records it as the published copy', async () => {
    files.set('paper/figures/old.excalidraw', scene)
    files.set('paper/figures/old.svg', '<svg/>')
    files.set('paper/figures/old.pdf', '%PDF-old')
    files.set(
      'paper/figures/src/old.figure.mjs',
      "await openFigure('paper/figures/old.excalidraw')\n"
    )
    const undo = await adoptFigure(
      owner,
      { folder: 'paper/figures', slug: 'old' },
      { workFolder: '.aster/figures', manuscript: 'paper/main.tex' }
    )
    expect(files.get('paper/figures/old.pdf')).toBe('%PDF-old')
    expect(files.has('paper/figures/old.excalidraw')).toBe(false)
    expect(files.get('.aster/figures/old.excalidraw')).toBe(scene)
    expect(files.get('.aster/figures/old.pdf')).toBeTruthy()
    expect(files.get('.aster/figures/.gitignore')).toContain('*.pdf')
    expect(files.get('.aster/figures/src/old.figure.mjs')).toContain(
      '.aster/figures/old.excalidraw'
    )
    const stored = JSON.parse(String(files.get('.aster/figures/published/old.json')))
    expect(stored.pdf).toBe('paper/figures/old.pdf')
    expect(stored.pdfSha256).toHaveLength(64)
    expect(stored.sceneSha256).toHaveLength(64)

    await undo()
    expect(files.has('paper/figures/old.excalidraw')).toBe(true)
    expect(files.has('.aster/figures/old.excalidraw')).toBe(false)
    expect(files.has('.aster/figures/published/old.json')).toBe(false)
    expect(files.get('paper/figures/src/old.figure.mjs')).toContain(
      "'paper/figures/old.excalidraw'"
    )
  })

  it('refuses when the working folder already has that name', async () => {
    files.set('paper/figures/old.excalidraw', scene)
    files.set('.aster/figures/old.excalidraw', scene)
    await expect(
      adoptFigure(
        owner,
        { folder: 'paper/figures', slug: 'old' },
        { workFolder: '.aster/figures', manuscript: 'paper/main.tex' }
      )
    ).rejects.toThrow(/already exists/)
    expect(files.get('paper/figures/old.excalidraw')).toBe(scene)
  })
})
