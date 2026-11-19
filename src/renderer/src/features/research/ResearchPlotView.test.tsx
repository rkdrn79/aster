// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as PlotFiles from './research-plot-files'
import type { PlotState } from './research-plot-files'

type PlotFilesModule = typeof PlotFiles

const plotState = vi.hoisted((): { current: PlotState | null } => ({ current: null }))
const publish = vi.hoisted(() => vi.fn(async () => undefined))

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }))
vi.mock('./research-figure-history', () => ({ snapshotFigure: vi.fn() }))
vi.mock('./research-plot-history', () => ({ snapshotPlot: vi.fn() }))
vi.mock('./research-plot-files', async (importOriginal) => {
  const actual: PlotFilesModule = await importOriginal()
  return {
    ...actual,
    usePlotState: () => plotState.current,
    usePlotPublish: () => ({ publishing: null, publish })
  }
})

import { ResearchPlotListItem } from './ResearchPlotListItem'
import { ResearchPlotView } from './ResearchPlotView'

const owner = { hostId: 'local', workspaceId: 'w1', workspacePath: '/p' }
const plot = {
  slug: 'flow',
  folder: '.aster/figures',
  script: true,
  manifest: true,
  svg: true,
  pdf: true,
  png: true
}
const finding = (code: string, message: string) => ({ code, id: null, message })

function state(run: PlotState['run']): PlotState {
  return {
    run,
    script: 'import aster_plot as ap\n',
    scriptSha256: 'abc',
    png: 'data:image/png;base64,iVBORw==',
    manifest: {
      slug: 'flow',
      script: 'src/flow.plot.py',
      sourceSha256: 'abc',
      lib: '1',
      size: { widthIn: 3.25, heightIn: 1.6 },
      panel: false,
      style: { preset: null, accent: null },
      panels: [],
      files: {},
      sha256: {},
      previews: null,
      renderedAt: null,
      findings: {
        errors: [finding('tiny-text', 'Ticks under 7 pt')],
        warnings: [finding('crowded-legend', 'The legend covers data')],
        notes: []
      }
    }
  }
}

const writeClipboardText = vi.fn(async () => undefined)

describe('plot view', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.assign(window, { api: { ui: { writeClipboardText } } })
  })
  afterEach(cleanup)

  it('shows the page size, the checks and the stale notice, and holds Use in paper', () => {
    plotState.current = state('stale')
    render(
      <ResearchPlotView owner={owner} plot={plot} manuscript="paper/main.tex" signatures={{}} />
    )
    expect(screen.getByText('3.25 × 1.6 in')).toBeTruthy()
    expect(screen.getByText('1 error · 1 warning')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toMatch(/script changed since its last run/)
    const use = screen.getByRole('button', { name: 'Use in paper' })
    expect(use.hasAttribute('disabled')).toBe(true)
    expect(use.parentElement?.getAttribute('title')).toMatch(/Ask the agent to run it first/)
    expect(screen.getByRole('img', { name: 'Plot flow' })).toBeTruthy()
  })

  it('shows the script with its checks, copies the LaTeX line and publishes a current plot', () => {
    plotState.current = state('current')
    render(
      <ResearchPlotView owner={owner} plot={plot} manuscript="paper/main.tex" signatures={{}} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Script' }))
    expect(screen.getByLabelText('Script').textContent).toBe('import aster_plot as ap\n')
    expect(screen.getByText('ERROR')).toBeTruthy()
    expect(screen.getByText('tiny-text')).toBeTruthy()
    expect(screen.getByText('warning')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Copy \\includegraphics/ }))
    expect(writeClipboardText).toHaveBeenCalledWith('\\includegraphics{figures/flow.pdf}')
    fireEvent.click(screen.getByRole('button', { name: 'Use in paper' }))
    expect(publish).toHaveBeenCalledWith(plot)
  })

  it('lists a plot with its tag, its run hint and its paper badge', () => {
    render(
      <ResearchPlotListItem
        owner={owner}
        slug="flow"
        state={state('stale')}
        active={false}
        usages={[12]}
        paperState="outdated"
        updatingPaper={false}
        onSelect={vi.fn()}
        onUpdatePaper={vi.fn()}
      />
    )
    expect(screen.getByText('Plot')).toBeTruthy()
    expect(screen.getByText('Script changed')).toBeTruthy()
    expect(screen.getByText('Paper copy outdated')).toBeTruthy()
    expect(screen.getByText(/In paper/)).toBeTruthy()
    // Why: a stale plot's PDF is not what its script draws now, so it is not offered.
    expect(screen.queryByRole('button', { name: 'Update flow in paper' })).toBeNull()
  })
})
