import { describe, expect, it, vi } from 'vitest'

const tree = vi.hoisted(() => new Map<string, string[]>())

vi.mock('./research-project-files', () => ({
  listProjectDirectory: async (_owner: unknown, folder: string) => {
    const names = tree.get(folder)
    return names ? names.map((name) => ({ name, isDirectory: !name.includes('.') })) : null
  },
  projectFileSignature: async (_owner: unknown, path: string) => {
    const folder = path.slice(0, path.lastIndexOf('/'))
    if (!tree.get(folder)?.includes(path.slice(folder.length + 1))) {
      throw new Error(`ENOENT ${path}`)
    }
    return { signature: `1:${path.length}`, mtime: 1 }
  },
  readProjectText: async (_owner: unknown, path: string) => {
    throw new Error(`ENOENT ${path}`)
  },
  writeProjectText: async () => undefined
}))

import { plotSignaturePaths, readFigureListing } from './research-figure-listing'

const owner = { hostId: 'local', workspaceId: 'w', workspacePath: '/p' }

describe('figure listing with plots', () => {
  it('lists plots from src/ and follows their script, run and paper copy', async () => {
    tree.clear()
    tree.set('.aster/figures', [
      'method.excalidraw',
      'flow.plot.json',
      'flow.png',
      'flow.pdf',
      'flow.svg',
      'flow.embed.svg',
      'src'
    ])
    tree.set('.aster/figures/src', ['flow.plot.py', 'bars.plot.py', 'aster_plot.py'])
    tree.set('paper/figures', ['flow.pdf', 'old.pdf'])
    const snapshot = await readFigureListing(
      owner,
      { work: '.aster/figures', paper: 'paper/figures' },
      'paper/main.tex'
    )
    expect(snapshot.listing.figures.map((figure) => figure.slug)).toEqual(['method'])
    expect(snapshot.listing.plots.map((plot) => [plot.slug, plot.script, plot.png])).toEqual([
      ['bars', true, false],
      ['flow', true, true]
    ])
    // The paper's copy of a plot is no figure of its own; other PDFs there still are.
    expect(snapshot.listing.others.map((entry) => entry.name)).toEqual(['old.pdf'])
    for (const path of [
      '.aster/figures/src/flow.plot.py',
      '.aster/figures/flow.plot.json',
      '.aster/figures/flow.png',
      '.aster/figures/flow.pdf',
      'paper/figures/flow.pdf'
    ]) {
      expect(snapshot.signatures[path]).toBe(`1:${path.length}`)
    }
    expect(snapshot.signatures['paper/figures/bars.pdf']).toBe('')
    expect(snapshot.signatures['.aster/figures/bars.png']).toBeUndefined()
  })

  it('has no plots when src/ is missing', async () => {
    tree.clear()
    tree.set('.aster/figures', ['flow.png'])
    const snapshot = await readFigureListing(
      owner,
      { work: '.aster/figures', paper: 'paper/figures' },
      'paper/main.tex'
    )
    expect(snapshot.listing.plots).toEqual([])
    expect(snapshot.listing.others.map((entry) => entry.name)).toEqual(['flow.png'])
  })

  it('names only the files a plot has, and always its paper copy', () => {
    expect(
      plotSignaturePaths(
        {
          slug: 'bars',
          folder: '.aster/figures',
          script: true,
          manifest: false,
          svg: false,
          pdf: false,
          png: false
        },
        'paper/main.tex'
      )
    ).toEqual(['.aster/figures/src/bars.plot.py', 'paper/figures/bars.pdf'])
  })
})
