import { beforeEach, describe, expect, it, vi } from 'vitest'

const files = new Map<string, string | Uint8Array>()

vi.mock('./research-project-files', () => ({
  projectOwnerKey: () => 'owner',
  projectRecordRoot: async () => '.aster',
  isMissingProjectFile: (error: unknown) => String(error).includes('ENOENT'),
  readProjectText: async (_owner: unknown, path: string) => {
    const value = files.get(path)
    if (typeof value !== 'string') {
      throw new Error(`ENOENT ${path}`)
    }
    return value
  },
  readProjectFile: async (_owner: unknown, path: string) => ({
    isBinary: true,
    content: files.has(path) ? 'cG5n' : '',
    mimeType: 'image/png'
  }),
  writeProjectText: async (_owner: unknown, path: string, text: string) => {
    files.set(path, text)
  },
  writeProjectBinary: async (_owner: unknown, path: string, bytes: Uint8Array) => {
    files.set(path, bytes)
  },
  deleteProjectPath: async (_owner: unknown, path: string) => {
    files.delete(path)
  },
  listProjectDirectory: async (_owner: unknown, folder: string) => {
    const names = new Set<string>()
    for (const path of files.keys()) {
      if (path.startsWith(`${folder}/`)) {
        names.add(path.slice(folder.length + 1).split('/')[0])
      }
    }
    return [...names].map((name) => ({ name, isDirectory: !name.includes('.') }))
  }
}))
vi.mock('./research-figure-history-render', () => ({
  figureThumbnailPng: async () => new Uint8Array([1, 2, 3])
}))

import {
  FIGURE_HISTORY_PER_FIGURE,
  listFigureHistory,
  readFigureSnapshot,
  snapshotFigure
} from './research-figure-history'

const owner = { hostId: 'local', workspaceId: 'w', workspacePath: '/p' }
const target = { owner, folder: 'paper/figures', slug: 'method' }
const scene = (ids: string[]): string =>
  `${JSON.stringify({
    type: 'excalidraw',
    version: 2,
    source: 'aster',
    elements: ids.map((id) => ({ id, type: 'rectangle', x: 0, y: 0, width: 10, height: 10 })),
    appState: {},
    files: {}
  })}\n`

describe('figure history', () => {
  beforeEach(() => {
    files.clear()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-08T10:00:00Z'))
  })

  it('keeps versions newest first with deltas, and skips a repeat of the newest', async () => {
    await snapshotFigure(target, { kind: 'before-send', what: 'Draw', text: scene(['a']) })
    vi.setSystemTime(new Date('2026-11-08T10:01:00Z'))
    const result = await snapshotFigure(target, {
      kind: 'agent-result',
      what: 'Draw',
      text: scene(['a', 'b', 'c']),
      compareTo: scene(['a'])
    })
    const again = await snapshotFigure(target, {
      kind: 'my-edit',
      what: 'Saved',
      text: scene(['a', 'b', 'c'])
    })
    expect(again?.id).toBe(result?.id)
    const entries = await listFigureHistory(owner, 'method')
    expect(entries.map((entry) => entry.kind)).toEqual(['agent-result', 'before-send'])
    expect(entries[0].deltas).toEqual({ added: 2, changed: 0, removed: 0 })
    expect(entries[0].thumbnail).toBe(true)
    expect(files.has(`.aster/cache/figures/history/method/${entries[0].id}.excalidraw`)).toBe(true)
    const text = await readFigureSnapshot(owner, 'method', entries[1].id)
    expect(JSON.parse(text).elements.map((element: { id: string }) => element.id)).toEqual(['a'])
  })

  it(`keeps at most ${FIGURE_HISTORY_PER_FIGURE} versions of a figure, dropping the oldest files`, async () => {
    for (let index = 0; index < FIGURE_HISTORY_PER_FIGURE + 3; index += 1) {
      vi.setSystemTime(new Date(Date.UTC(2026, 10, 8, 10, index)))
      await snapshotFigure(target, {
        kind: 'my-edit',
        what: `edit ${index}`,
        text: scene([`e${index}`])
      })
    }
    const entries = await listFigureHistory(owner, 'method')
    expect(entries).toHaveLength(FIGURE_HISTORY_PER_FIGURE)
    expect(entries.at(-1)?.what).toBe('edit 3')
    const scenes = [...files.keys()].filter((path) => path.endsWith('.excalidraw'))
    expect(scenes).toHaveLength(FIGURE_HISTORY_PER_FIGURE)
  })
})
