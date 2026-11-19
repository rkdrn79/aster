import { describe, expect, it, vi } from 'vitest'

vi.mock('./research-project-files', () => ({
  projectAbsolutePath: (owner: { workspacePath: string }, path: string) =>
    `${owner.workspacePath}/${path}`,
  readProjectText: vi.fn(async () => '')
}))
vi.mock('./research-writing-source', () => ({ resolveManuscriptFile: vi.fn() }))
vi.mock('./research-writing-project', () => ({ readWritingManuscript: vi.fn() }))

import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { figurePromptContext, figureRequestPlotTarget } from './research-figure-prompt-context'
import { openFigureSendTrack } from './research-figures-page-helpers'

const owner = { hostId: 'local', workspaceId: 'w', workspacePath: '/p' }
const host = {
  api: null,
  target: null,
  folder: '.aster/figures',
  owner,
  manuscript: 'paper/main.tex',
  plot: 'flow'
}

describe('the prompt context of an open plot', () => {
  it('names the plot files on the host and no figure', () => {
    expect(figurePromptContext(host)).toEqual({
      folderPath: '/p/.aster/figures',
      workFolderPath: '/p/.aster/figures',
      manuscriptPath: '/p/paper/main.tex',
      figure: null,
      plot: {
        slug: 'flow',
        scriptPath: '/p/.aster/figures/src/flow.plot.py',
        pngPath: '/p/.aster/figures/flow.png',
        pdfPath: '/p/.aster/figures/flow.pdf',
        manifestPath: '/p/.aster/figures/flow.plot.json'
      },
      // No reference folder on this device and nothing chosen: careful and concept off, no refs.
      modes: { careful: null, references: null, concept: false }
    })
    expect(figurePromptContext({ ...host, plot: null }).plot).toBeNull()
  })

  it('leaves the plot out while a diagram is on the canvas', () => {
    // Why Object.create: the context reads only the page off the canvas.
    const api: ExcalidrawImperativeAPI = Object.assign(Object.create(null), {
      getSceneElements: () => []
    })
    const target = { owner, folder: '.aster/figures', slug: 'method' }
    const context = figurePromptContext({ ...host, api, target })
    expect(context.plot).toBeNull()
    expect(context.figure?.slug).toBe('method')
    expect(figureRequestPlotTarget({ ...host, api })).toBeNull()
  })

  it('tracks a send on the open plot by its files, not a scene', async () => {
    expect(figureRequestPlotTarget(host)).toEqual({ owner, folder: '.aster/figures', slug: 'flow' })
    expect(await openFigureSendTrack(host)).toEqual({
      target: { owner, folder: '.aster/figures', slug: 'flow' },
      beforeText: null,
      plot: true
    })
    expect(await openFigureSendTrack({ ...host, plot: null })).toBeNull()
  })
})
