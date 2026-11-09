import { describe, expect, it } from 'vitest'
import {
  captionFromChat,
  figureBlock,
  figureUsageLines,
  insertFigureBlock,
  manuscriptSections,
  renameFigureIncludes
} from './research-figure-paper-block'
import {
  figureExportState,
  figureSceneMeta,
  filterFigures,
  figureTrashFolder,
  uniqueFigureSlug,
  withFigureTitle
} from './research-figure-list-model'
import {
  fitPageToContent,
  pageResizePatches,
  pageSizeWarning,
  parseInches,
  recreatePageHeight
} from './research-figure-page-size'

const TEX = [
  '\\documentclass{article}',
  '\\begin{document}',
  '\\section{Introduction}',
  'Intro text.',
  '\\section{Method}',
  '\\label{sec:method}',
  'We train with $L_2$.',
  '\\includegraphics{figures/method-overview.pdf}',
  '% \\includegraphics{figures/old.pdf}',
  '\\includegraphics[width=\\linewidth]{figures/method-overview-2}',
  '\\subsection{Losses}',
  '\\end{document}'
].join('\n')

describe('manuscript and figure blocks', () => {
  it('finds where a figure is used, skipping comments and longer names', () => {
    expect(figureUsageLines(TEX, 'method-overview')).toEqual([8])
    expect(figureUsageLines(TEX, 'method-overview-2')).toEqual([10])
    expect(figureUsageLines(TEX, 'old')).toEqual([])
  })

  it('lists sections with their lines and levels', () => {
    expect(manuscriptSections(TEX)).toEqual([
      { title: 'Introduction', line: 3, level: 1 },
      { title: 'Method', line: 5, level: 1 },
      { title: 'Losses', line: 11, level: 2 }
    ])
  })

  it('inserts the block after the heading and its label, between blank lines', () => {
    const block = figureBlock({
      slug: 'teaser',
      widthIn: 3.25,
      caption: 'A cat.',
      label: 'fig:cat'
    })
    expect(block).toContain('\\begin{figure}[t]')
    expect(block).toContain('\\label{fig:cat}')
    const result = insertFigureBlock(TEX, block, 5)
    const lines = result.text.split('\n')
    expect(lines[5]).toBe('\\label{sec:method}')
    expect(lines[6]).toBe('')
    expect(result.line).toBe(8)
    expect(lines[result.line - 1]).toBe('\\begin{figure}[t]')
    expect(lines[result.line - 1 + 6]).toBe('')
  })

  it('makes a full-width block for a double-column figure', () => {
    expect(figureBlock({ slug: 'x', widthIn: 6.75, caption: '', label: '' })).toContain(
      '\\begin{figure*}[t]'
    )
  })

  it('rewrites only the renamed figure in includegraphics lines', () => {
    const renamed = renameFigureIncludes(TEX, 'method-overview', 'overview')
    expect(renamed.count).toBe(1)
    expect(renamed.text).toContain('{figures/overview.pdf}')
    expect(renamed.text).toContain('{figures/method-overview-2}')
  })

  it('takes the last caption the agent proposed', () => {
    const chat = 'Caption: "First try."\nlater…\nProposed caption: “Our method predicts features.”'
    expect(captionFromChat(chat)).toBe('Our method predicts features.')
    expect(captionFromChat('no proposal here')).toBeNull()
  })
})

describe('figure list model', () => {
  const scene = JSON.stringify({
    elements: [
      {
        id: 'figure-page',
        type: 'frame',
        customData: { asterPage: { widthIn: 3.25, title: 'Overview', caption: 'A cap.' } }
      }
    ]
  })

  it('reads and writes the page title', () => {
    expect(figureSceneMeta(scene)).toEqual({ title: 'Overview', caption: 'A cap.' })
    expect(figureSceneMeta('not json')).toEqual({ title: null, caption: null })
    expect(figureSceneMeta(withFigureTitle(scene, 'New name')).title).toBe('New name')
    expect(figureSceneMeta(withFigureTitle(scene, null)).title).toBeNull()
  })

  it('searches titles and file names and sorts', () => {
    const entries = [
      { slug: 'b', title: 'Zebra', modified: 1 },
      { slug: 'a', title: null, modified: 3 },
      { slug: 'c', title: 'Apple', modified: 2 }
    ]
    expect(filterFigures(entries, '', 'recent').map((e) => e.slug)).toEqual(['a', 'c', 'b'])
    expect(filterFigures(entries, '', 'name').map((e) => e.slug)).toEqual(['a', 'c', 'b'])
    expect(filterFigures(entries, 'zeb', 'name').map((e) => e.slug)).toEqual(['b'])
  })

  it('names copies and trash folders', () => {
    expect(uniqueFigureSlug('fig', new Set(['fig']))).toBe('fig-copy')
    expect(uniqueFigureSlug('fig', new Set(['fig-copy', 'fig-copy-2']))).toBe('fig-copy-3')
    expect(figureTrashFolder('.aster', 'fig', new Date('2026-11-08T10:00:00.000Z'))).toBe(
      '.aster/trash/figures/2026-11-08T10-00-00-000Z-fig'
    )
  })

  it('calls an export outdated when the scene is newer than its PDF', () => {
    expect(figureExportState('10:2000', '10:1000')).toBe('outdated')
    expect(figureExportState('10:1000', '10:2000')).toBe('fresh')
    expect(figureExportState('10:1000', undefined)).toBe('missing')
  })
})

describe('page size', () => {
  const page = { id: 'figure-page', type: 'frame', x: 0, y: 0, width: 468, height: 288 }
  const box = { id: 'b', type: 'rectangle', x: 100, y: 100, width: 50, height: 40 }
  const label = { id: 't', type: 'text', x: 110, y: 110, width: 30, height: 20 }
  const arrow = {
    id: 'a',
    type: 'arrow',
    x: 150,
    y: 120,
    width: 40,
    height: 0,
    points: [
      [0, 0],
      [40, 0]
    ] as const
  }
  const outside = { id: 'o', type: 'rectangle', x: 900, y: 900, width: 10, height: 10 }

  it('parses sizes and warns about a tall full-width figure', () => {
    expect(parseInches(' 3.25 ')).toBe(3.25)
    expect(parseInches('0.1')).toBeNull()
    expect(pageSizeWarning(6.75, 3.2)).toMatch(/Tall/)
    expect(pageSizeWarning(6.75, 2.8)).toBeNull()
    expect(pageSizeWarning(3.25, 5)).toBeNull()
  })

  it('keeps content size and centres it across a wider page', () => {
    const patches = pageResizePatches(
      [page, box, label, outside],
      page,
      { widthIn: 6.75, heightIn: 2 },
      'keep'
    )
    expect(patches[0]).toEqual({ id: 'figure-page', width: 972, height: 288 })
    expect(patches.find((patch) => patch.id === 'b')?.x).toBe(100 + 252)
    expect(patches.some((patch) => patch.id === 'o')).toBe(false)
  })

  it('scales shapes but keeps text at its point size, centred', () => {
    const patches = pageResizePatches(
      [page, box, label, arrow],
      page,
      { widthIn: 6.5, heightIn: 4 },
      'scale'
    )
    const scaled = patches.find((patch) => patch.id === 'b')
    expect(scaled).toMatchObject({ x: 200, y: 200, width: 100, height: 80 })
    const text = patches.find((patch) => patch.id === 't')
    expect(text).toEqual({ id: 't', x: 2 * 125 - 15, y: 2 * 120 - 10 })
    expect(patches.find((patch) => patch.id === 'a')?.points).toEqual([
      [0, 0],
      [80, 0]
    ])
  })

  it('fits the page height to the drawing', () => {
    expect(fitPageToContent([page, box, arrow], page, 12)).toEqual({
      y: 88,
      height: 72,
      heightIn: 0.5
    })
    expect(fitPageToContent([page], page)).toBeNull()
  })

  it('says when Recreate would make a tall page', () => {
    expect(recreatePageHeight(3.25, { width: 600, height: 400 })).toEqual({
      heightIn: 2.17,
      tall: false
    })
    expect(recreatePageHeight(3.25, { width: 400, height: 600 })).toEqual({
      heightIn: 4.88,
      tall: true
    })
  })
})
