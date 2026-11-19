import { beforeEach, describe, expect, it, vi } from 'vitest'

const files = vi.hoisted(() => new Map<string, Uint8Array>())

vi.mock('./research-project-files', () => {
  const missing = (path: string): Error => new Error(`ENOENT ${path}`)
  const bytes = (text: string): Uint8Array => new TextEncoder().encode(text)
  return {
    projectOwnerKey: () => 'owner',
    projectRecordRoot: async () => '.aster',
    isMissingProjectFile: (error: unknown) => String(error).includes('ENOENT'),
    base64ToBytes: (content: string) => Uint8Array.from(Buffer.from(content, 'base64')),
    readProjectText: async (_owner: unknown, path: string) => {
      const value = files.get(path)
      if (!value) {
        throw missing(path)
      }
      return new TextDecoder().decode(value)
    },
    readProjectFile: async (_owner: unknown, path: string) => {
      const value = files.get(path)
      if (!value) {
        throw missing(path)
      }
      return { isBinary: true, content: Buffer.from(value).toString('base64'), mimeType: null }
    },
    writeProjectText: async (_owner: unknown, path: string, text: string) => {
      files.set(path, bytes(text))
    },
    writeProjectBinary: async (_owner: unknown, path: string, data: Uint8Array) => {
      files.set(path, data)
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
  }
})

import { FIGURE_HISTORY_PER_FIGURE, listFigureHistory } from './research-figure-history'
import { restorePlotSnapshot, snapshotPlot } from './research-plot-history'

const owner = { hostId: 'local', workspaceId: 'w', workspacePath: '/p' }
const target = { owner, folder: '.aster/figures', slug: 'flow' }
const HISTORY = '.aster/cache/figures/history/flow'
const text = (path: string): string | null => {
  const value = files.get(path)
  return value ? new TextDecoder().decode(value) : null
}
const put = (path: string, value: string): void => {
  files.set(path, new TextEncoder().encode(value))
}
function writePlot(script: string, run: boolean): void {
  put('.aster/figures/src/flow.plot.py', script)
  if (run) {
    put('.aster/figures/flow.plot.json', `{"kind":"aster-plot","slug":"flow","ran":"${script}"}`)
    put('.aster/figures/flow.png', `png of ${script}`)
    put('.aster/figures/flow.pdf', `pdf of ${script}`)
    put('.aster/figures/flow.svg', `svg of ${script}`)
    put('.aster/figures/flow.embed.svg', `embed of ${script}`)
  }
}

describe('plot history', () => {
  beforeEach(() => {
    files.clear()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-17T10:00:00Z'))
  })

  it('keeps every file of a plot, the PNG as its thumbnail, and skips an unchanged plot', async () => {
    writePlot('v1', false)
    const before = await snapshotPlot(target, { kind: 'before-send', what: 'Plot from Runs' })
    expect(before?.plot).toEqual(['.plot.py'])
    expect(before?.thumbnail).toBe(false)
    vi.setSystemTime(new Date('2026-11-17T10:01:00Z'))
    writePlot('v2', true)
    const after = await snapshotPlot(target, { kind: 'agent-result', what: 'Plot from Runs' })
    const again = await snapshotPlot(target, { kind: 'agent-result', what: 'Plot from Runs' })
    expect(again?.id).toBe(after?.id)
    expect(after?.plot).toEqual(['.plot.py', '.plot.json', '.pdf', '.svg', '.embed.svg', '.png'])
    expect(after?.thumbnail).toBe(true)
    expect(text(`${HISTORY}/${after?.id}.png`)).toBe('png of v2')
    expect(text(`${HISTORY}/${after?.id}.plot.py`)).toBe('v2')
    const entries = await listFigureHistory(owner, 'flow')
    expect(entries.map((entry) => entry.kind)).toEqual(['agent-result', 'before-send'])
  })

  it('keeps nothing for a plot with no files yet', async () => {
    expect(await snapshotPlot(target, { kind: 'before-send', what: 'Plot' })).toBeNull()
    expect(await listFigureHistory(owner, 'flow')).toEqual([])
  })

  it('restores a version: its files come back, later run outputs go, the current one is kept', async () => {
    writePlot('v1', false)
    const first = await snapshotPlot(target, { kind: 'before-send', what: 'Plot' })
    vi.setSystemTime(new Date('2026-11-17T10:01:00Z'))
    writePlot('v2', true)
    await snapshotPlot(target, { kind: 'agent-result', what: 'Plot' })
    vi.setSystemTime(new Date('2026-11-17T10:02:00Z'))
    expect(await restorePlotSnapshot(target, first?.id ?? '')).toBeNull()
    expect(text('.aster/figures/src/flow.plot.py')).toBe('v1')
    expect(files.has('.aster/figures/flow.png')).toBe(false)
    expect(files.has('.aster/figures/flow.plot.json')).toBe(false)
    const entries = await listFigureHistory(owner, 'flow')
    // The agent's result was the newest version, so restoring kept nothing new for it.
    expect(entries.map((entry) => entry.kind)).toEqual(['agent-result', 'before-send'])
    writePlot('v3 by hand', false)
    vi.setSystemTime(new Date('2026-11-17T10:03:00Z'))
    expect(await restorePlotSnapshot(target, entries[0].id)).toBeNull()
    expect(text('.aster/figures/flow.png')).toBe('png of v2')
    const after = await listFigureHistory(owner, 'flow')
    expect(after[0].kind).toBe('before-restore')
    expect(text(`${HISTORY}/${after[0].id}.plot.py`)).toBe('v3 by hand')
  })

  it('refuses a version that is not a plot version', async () => {
    expect(await restorePlotSnapshot(target, 'missing')).toMatch(/not one of this plot/)
  })

  it(`keeps at most ${FIGURE_HISTORY_PER_FIGURE} versions, dropping the oldest plot files`, async () => {
    for (let index = 0; index < FIGURE_HISTORY_PER_FIGURE + 2; index += 1) {
      vi.setSystemTime(new Date(Date.UTC(2026, 10, 17, 10, index)))
      writePlot(`v${index}`, true)
      await snapshotPlot(target, { kind: 'agent-result', what: `turn ${index}` })
    }
    const entries = await listFigureHistory(owner, 'flow')
    expect(entries).toHaveLength(FIGURE_HISTORY_PER_FIGURE)
    expect(entries.at(-1)?.what).toBe('turn 2')
    const scripts = [...files.keys()].filter(
      (path) => path.startsWith(HISTORY) && path.endsWith('.plot.py')
    )
    expect(scripts).toHaveLength(FIGURE_HISTORY_PER_FIGURE)
    const pngs = [...files.keys()].filter(
      (path) => path.startsWith(HISTORY) && path.endsWith('.png')
    )
    expect(pngs).toHaveLength(FIGURE_HISTORY_PER_FIGURE)
  })
})
