import { beforeEach, describe, expect, it, vi } from 'vitest'

const files = vi.hoisted(() => new Map<string, { text: string; mtime: number }>())

vi.mock('./research-project-files', () => ({
  projectOwnerKey: (owner: { hostId: string; workspaceId: string }) =>
    JSON.stringify([owner.hostId, owner.workspaceId]),
  listProjectDirectory: async (_owner: unknown, folder: string) => {
    const names = new Map<string, boolean>()
    for (const path of files.keys()) {
      if (path.startsWith(`${folder}/`)) {
        const rest = path.slice(folder.length + 1)
        names.set(rest.split('/')[0], rest.includes('/'))
      }
    }
    return names.size
      ? [...names].map(([name, isDirectory]) => ({ name, isDirectory, isSymlink: false }))
      : null
  },
  projectFileSignature: async (_owner: unknown, path: string) => {
    const file = files.get(path)
    if (!file) {
      throw new Error(`ENOENT ${path}`)
    }
    return { signature: `${file.text.length}:${file.mtime}`, mtime: file.mtime }
  },
  readProjectText: async (_owner: unknown, path: string) => {
    const file = files.get(path)
    if (!file) {
      throw new Error(`ENOENT ${path}`)
    }
    return file.text
  },
  writeProjectText: async (_owner: unknown, path: string, text: string) => {
    files.set(path, { text, mtime: 1 })
  },
  deleteProjectPath: async (_owner: unknown, path: string) => {
    files.delete(path)
  }
}))

import {
  createFigureBackgroundWatch,
  WATCH_COLD_MS,
  WATCH_HOT_MS
} from './research-figure-background-watch'
import type { FigureRenderRequest } from './research-figure-background-watch'

const owner = { hostId: 'ssh:vip', workspaceId: 'w1', workspacePath: '/home/me/paper' }
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

describe('the figure background watch', () => {
  let clock = 0
  let asked: FigureRenderRequest[] = []
  const watch = () => {
    const created = createFigureBackgroundWatch({
      now: () => clock,
      render: (request) => asked.push(request)
    })
    created.setProjects([owner])
    return created
  }

  beforeEach(() => {
    files.clear()
    clock = 1_000_000
    asked = []
    files.set('.aster/project.json', {
      text: '{"manuscript":{"source":"paper/main.tex"}}',
      mtime: 1
    })
    files.set('.aster/figures/method.excalidraw', { text: '{"elements":[]}', mtime: 1 })
    files.set('paper/figures/old.excalidraw', { text: '{"elements":[]}', mtime: 1 })
  })

  it('stamps the project and checks every figure once, beside the manuscript too', async () => {
    const watcher = watch()
    watcher.tick()
    await settle()
    const stamp = JSON.parse(files.get('.aster/cache/figures/.aster-renderer.json')?.text ?? '{}')
    expect(stamp.renderer).toBe('aster-desktop')
    expect(Date.parse(stamp.at)).toBe(clock)
    expect(
      asked.map((request) => [
        request.target.folder,
        request.target.slug,
        request.priority,
        request.delayMs
      ])
    ).toEqual([
      ['.aster/figures', 'method', 0, 0],
      ['paper/figures', 'old', 0, 0]
    ])
  })

  it('renders a changed scene after the debounce and looks again often for a while', async () => {
    const watcher = watch()
    watcher.tick()
    await settle()
    asked = []
    files.set('.aster/figures/method.excalidraw', { text: '{"elements":[1]}', mtime: 2 })
    clock += WATCH_COLD_MS
    watcher.tick()
    await settle()
    expect(asked).toEqual([
      { target: { owner, folder: '.aster/figures', slug: 'method' }, priority: 1 }
    ])
    asked = []
    clock += WATCH_HOT_MS
    files.set('.aster/cache/figures/method.request.json', { text: '{}', mtime: 3 })
    watcher.tick()
    await settle()
    expect(asked).toEqual([
      { target: { owner, folder: '.aster/figures', slug: 'method' }, priority: 2, delayMs: 0 }
    ])
    expect(files.has('.aster/cache/figures/method.request.json')).toBe(false)
  })

  it('leaves a project that is not a research project alone', async () => {
    files.delete('.aster/project.json')
    const watcher = watch()
    watcher.tick()
    await settle()
    expect(asked).toEqual([])
    expect(files.has('.aster/cache/figures/.aster-renderer.json')).toBe(false)
  })
})
