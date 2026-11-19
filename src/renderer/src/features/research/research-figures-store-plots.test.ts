import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./research-figure-listing', () => ({
  readFigureListing: vi.fn(),
  ensureFigureWorkFolder: vi.fn(async () => undefined)
}))
vi.mock('./research-project-files', () => ({
  ProjectWriteConflict: class extends Error {},
  projectOwnerKey: (owner: { hostId: string; workspaceId: string }) =>
    JSON.stringify([owner.hostId, owner.workspaceId]),
  projectRecordRoot: async () => '.aster',
  writeProjectText: vi.fn(async () => undefined)
}))

import type { FigureListing } from '../../../../research-harness/research-figures-locations.mjs'
import { readFigureListing } from './research-figure-listing'
import {
  expectFigureSelection,
  firstSelection,
  openFigureSlug,
  openFiguresProject,
  openPlotTarget,
  parseFigureSelection,
  refreshFigureList,
  selectFigure,
  stillListed,
  useResearchFigures
} from './research-figures-store'

const owner = { hostId: 'local', workspaceId: 'w', workspacePath: '/p' }
const FOLDER = '.aster/figures'

function listing(input: {
  figures?: string[]
  plots?: string[]
  others?: string[]
}): FigureListing {
  return {
    figures: (input.figures ?? []).map((slug) => ({
      slug,
      svg: false,
      pdf: false,
      png: false,
      folder: FOLDER,
      location: 'work' as const
    })),
    plots: (input.plots ?? []).map((slug) => ({
      slug,
      script: true,
      manifest: false,
      svg: false,
      pdf: false,
      png: false,
      folder: FOLDER
    })),
    others: (input.others ?? []).map((name) => ({ name, kind: 'pdf' as const, folder: FOLDER })),
    shadowed: []
  }
}

function serve(next: FigureListing): void {
  vi.mocked(readFigureListing).mockResolvedValue({
    listing: next,
    signatures: {},
    publications: {},
    manuscriptSignature: ''
  })
}

describe('plot selection', () => {
  beforeEach(() => {
    useResearchFigures.setState({ ownerKey: null, owner: null, selected: null, folder: null })
    vi.clearAllMocks()
  })

  it('reads stored selections of every kind and nothing else', () => {
    expect(parseFigureSelection({ kind: 'plot', slug: 'loss' })).toEqual({
      kind: 'plot',
      slug: 'loss'
    })
    expect(parseFigureSelection({ kind: 'figure', slug: 'method' })).toEqual({
      kind: 'figure',
      slug: 'method'
    })
    expect(parseFigureSelection({ kind: 'file', name: 'a.pdf' })).toEqual({
      kind: 'file',
      name: 'a.pdf'
    })
    expect(parseFigureSelection({ kind: 'plot', name: 'loss' })).toBeNull()
    expect(parseFigureSelection({ kind: 'chart', slug: 'loss' })).toBeNull()
    expect(parseFigureSelection(null)).toBeNull()
  })

  it('opens diagrams first, then plots, then read-only files', () => {
    expect(firstSelection(listing({ figures: ['m'], plots: ['p'], others: ['o.pdf'] }))).toEqual({
      kind: 'figure',
      slug: 'm'
    })
    expect(firstSelection(listing({ plots: ['p'], others: ['o.pdf'] }))).toEqual({
      kind: 'plot',
      slug: 'p'
    })
    expect(firstSelection(listing({ others: ['o.pdf'] }))).toEqual({ kind: 'file', name: 'o.pdf' })
    expect(firstSelection(listing({}))).toBeNull()
    const both = listing({ figures: ['m'], plots: ['p'] })
    expect(stillListed(both, { kind: 'plot', slug: 'p' })).toBe(true)
    expect(stillListed(both, { kind: 'plot', slug: 'm' })).toBe(false)
    expect(stillListed(both, { kind: 'figure', slug: 'p' })).toBe(false)
  })

  it('opens a plot, whose slug keys the agent chat and whose target its turns', async () => {
    serve(listing({ figures: ['method'], plots: ['loss'] }))
    await openFiguresProject(owner, 'paper/main.tex', { kind: 'plot', slug: 'loss' })
    expect(useResearchFigures.getState().selected).toEqual({ kind: 'plot', slug: 'loss' })
    expect(openFigureSlug(owner)).toBe('loss')
    expect(openPlotTarget(owner)).toEqual({ owner, folder: FOLDER, slug: 'loss' })
    expect(openPlotTarget({ hostId: 'local', workspaceId: 'other' })).toBeNull()
    selectFigure(owner, { kind: 'figure', slug: 'method' })
    expect(openPlotTarget(owner)).toBeNull()
    expect(openFigureSlug(owner)).toBe('method')
  })

  it('keeps an open plot across refreshes and falls back when it is gone', async () => {
    serve(listing({ figures: ['method'], plots: ['loss'] }))
    await openFiguresProject(owner, 'paper/main.tex', { kind: 'plot', slug: 'loss' })
    serve(listing({ figures: ['method'], plots: ['loss', 'acc'] }))
    await refreshFigureList(owner)
    expect(useResearchFigures.getState().selected).toEqual({ kind: 'plot', slug: 'loss' })
    serve(listing({ figures: ['method'], plots: ['acc'] }))
    await refreshFigureList(owner)
    expect(useResearchFigures.getState().selected).toEqual({ kind: 'figure', slug: 'method' })
  })

  it('opens a plot asked for once the agent writes it, unless the person moved on', async () => {
    serve(listing({ figures: ['method'] }))
    await openFiguresProject(owner, 'paper/main.tex')
    expectFigureSelection(owner, { kind: 'plot', slug: 'loss' })
    serve(listing({ figures: ['method', 'other'] }))
    await refreshFigureList(owner)
    expect(useResearchFigures.getState().selected).toEqual({ kind: 'figure', slug: 'method' })
    serve(listing({ figures: ['method', 'other'], plots: ['loss'] }))
    await refreshFigureList(owner)
    expect(useResearchFigures.getState().selected).toEqual({ kind: 'plot', slug: 'loss' })

    expectFigureSelection(owner, { kind: 'plot', slug: 'acc' })
    selectFigure(owner, { kind: 'figure', slug: 'other' })
    serve(listing({ figures: ['method', 'other'], plots: ['acc', 'loss'] }))
    await refreshFigureList(owner)
    expect(useResearchFigures.getState().selected).toEqual({ kind: 'figure', slug: 'other' })
  })
})
