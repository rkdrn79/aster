import { beforeEach, describe, expect, it, vi } from 'vitest'

type Stored = string | Uint8Array
const files = vi.hoisted(() => new Map<string, Stored>())

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }))
vi.mock('./research-figures-store', () => ({ refreshFigureList: vi.fn(async () => undefined) }))
vi.mock('./research-figure-publish', () => ({
  FigurePublishConflict: class extends Error {},
  publishFigureCopy: vi.fn(async (input: { manuscript: string; slug: string }) => ({
    pdf: `paper/figures/${input.slug}.pdf`,
    undo: async () => undefined
  })),
  toastPublished: vi.fn(),
  toastPublishConflict: vi.fn()
}))
vi.mock('./research-project-files', () => {
  const missing = (path: string): Error => new Error(`ENOENT: ${path}`)
  return {
    base64ToBytes: (content: string) => Uint8Array.from(Buffer.from(content, 'base64')),
    readProjectText: async (_owner: unknown, path: string) => {
      const value = files.get(path)
      if (typeof value !== 'string') {
        throw missing(path)
      }
      return value
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
            content: Buffer.from(value).toString('base64'),
            mimeType: 'image/png'
          }
    }
  }
})

import { createHash } from 'node:crypto'
import { publishFigureCopy } from './research-figure-publish'
import {
  plotFindingCounts,
  plotFindingText,
  plotIncludeLine,
  plotPaperState,
  plotPublishBlocked,
  plotRunHint,
  plotRunState,
  publishPlot,
  readPlotState
} from './research-plot-files'

const owner = { hostId: 'local', workspaceId: 'w', workspacePath: '/p' }
const sha = (text: string): string => createHash('sha256').update(text).digest('hex')
const SCRIPT = 'import aster_plot as ap\nap.figure()\n'
const manifest = (sourceSha256: string, findings = {}): string =>
  JSON.stringify({
    kind: 'aster-plot',
    version: 1,
    slug: 'flow',
    sourceSha256,
    size: { widthIn: 3.25, heightIn: 1.6 },
    findings: { errors: [], warnings: [], notes: [], ...findings }
  })
const plot = {
  slug: 'flow',
  folder: '.aster/figures',
  script: true,
  manifest: true,
  svg: true,
  pdf: true,
  png: true
}

describe('plot run state', () => {
  it('compares the manifest with the script it ran', () => {
    expect(plotRunState({ scriptSha256: 'a', manifest: { sourceSha256: 'a' } })).toBe('current')
    expect(plotRunState({ scriptSha256: 'b', manifest: { sourceSha256: 'a' } })).toBe('stale')
    expect(plotRunState({ scriptSha256: 'a', manifest: null })).toBe('not-run')
    expect(plotRunState({ scriptSha256: null, manifest: { sourceSha256: 'a' } })).toBe('no-script')
    expect(plotRunHint('current')).toBeNull()
    expect(plotRunHint('stale')).toBe('Script changed')
    expect(plotRunHint('not-run')).toBe('Not run yet')
  })

  it('counts and words the checks', () => {
    const counts = plotFindingCounts({
      findings: {
        errors: [{ code: 'tiny-text', id: 'a', message: 'Ticks under 7 pt' }],
        warnings: [
          { code: 'w1', id: null, message: 'one' },
          { code: 'w2', id: null, message: 'two' }
        ],
        notes: []
      }
    })
    expect(counts).toEqual({ errors: 1, warnings: 2, notes: 0 })
    expect(plotFindingText(counts)).toBe('1 error · 2 warnings')
    expect(plotFindingText({ errors: 0, warnings: 0 })).toBeNull()
    expect(plotFindingCounts(null)).toEqual({ errors: 0, warnings: 0, notes: 0 })
  })

  it('says why Use in paper cannot run', () => {
    expect(plotPublishBlocked({ hasPdf: true, run: 'current', manuscript: 'paper/main.tex' })).toBe(
      null
    )
    expect(
      plotPublishBlocked({ hasPdf: true, run: 'stale', manuscript: 'paper/main.tex' })
    ).toMatch(/script changed/)
    expect(plotPublishBlocked({ hasPdf: false, run: 'current', manuscript: 'm.tex' })).toMatch(
      /no PDF/
    )
    expect(plotPublishBlocked({ hasPdf: true, run: 'current', manuscript: null })).toMatch(
      /manuscript/
    )
    expect(plotIncludeLine('flow')).toBe('\\includegraphics{figures/flow.pdf}')
  })

  it('reads the paper copy against the script it was published from', () => {
    const publications = {
      flow: {
        slug: 'flow',
        pdf: 'paper/figures/flow.pdf',
        pdfSha256: 'p',
        sceneSha256: 'old',
        publishedAt: '2026-11-17T00:00:00Z'
      }
    }
    const input = {
      slug: 'flow',
      manuscript: 'paper/main.tex',
      signatures: { 'paper/figures/flow.pdf': '10:1' },
      publications
    }
    expect(plotPaperState({ ...input, scriptSha256: 'old' })).toBe('current')
    expect(plotPaperState({ ...input, scriptSha256: 'new' })).toBe('outdated')
    expect(plotPaperState({ ...input, signatures: {}, scriptSha256: 'old' })).toBe('missing')
    expect(plotPaperState({ ...input, publications: {}, scriptSha256: 'old' })).toBe('none')
  })
})

describe('reading a plot', () => {
  beforeEach(() => {
    files.clear()
    vi.clearAllMocks()
    files.set('.aster/figures/src/flow.plot.py', SCRIPT)
    files.set('.aster/figures/flow.png', new Uint8Array([137, 80, 78, 71]))
    files.set('.aster/figures/flow.pdf', new Uint8Array([37, 80, 68, 70]))
  })

  it('finds a current run, its preview and its checks', async () => {
    files.set(
      '.aster/figures/flow.plot.json',
      manifest(sha(SCRIPT), { warnings: [{ code: 'w', id: null, message: 'm' }] })
    )
    const state = await readPlotState(owner, plot)
    expect(state.run).toBe('current')
    expect(state.script).toBe(SCRIPT)
    expect(state.scriptSha256).toBe(sha(SCRIPT))
    expect(state.png).toBe('data:image/png;base64,iVBORw==')
    expect(state.manifest?.size).toEqual({ widthIn: 3.25, heightIn: 1.6 })
    expect(state.manifest?.findings.warnings).toHaveLength(1)
  })

  it('calls a plot stale once its script changed, and not run without a manifest', async () => {
    files.set('.aster/figures/flow.plot.json', manifest(sha('older script')))
    expect((await readPlotState(owner, plot)).run).toBe('stale')
    expect((await readPlotState(owner, { ...plot, manifest: false, png: false })).run).toBe(
      'not-run'
    )
  })

  it('publishes a current plot with its script hash, and refuses a stale one', async () => {
    files.set('.aster/figures/flow.plot.json', manifest(sha(SCRIPT)))
    await publishPlot({ owner, plot, manuscript: 'paper/main.tex' })
    expect(publishFigureCopy).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: 'flow',
        from: '.aster/figures/flow.pdf',
        manuscript: 'paper/main.tex',
        sceneSha256: sha(SCRIPT)
      })
    )
    files.set('.aster/figures/src/flow.plot.py', `${SCRIPT}# edited\n`)
    await expect(publishPlot({ owner, plot, manuscript: 'paper/main.tex' })).rejects.toThrow(
      /script changed/
    )
    expect(publishFigureCopy).toHaveBeenCalledTimes(1)
  })
})
