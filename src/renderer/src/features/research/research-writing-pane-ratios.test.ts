// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import {
  constrainWritingPaneRatios,
  DEFAULT_WRITING_PANE_ORDER,
  DEFAULT_WRITING_PANE_RATIOS,
  DEFAULT_WRITING_PANE_VISIBILITY,
  readWritingPaneOrder,
  readWritingPaneRatios,
  readWritingPaneVisibility,
  resizeWritingPaneRatios,
  saveWritingPaneOrder,
  saveWritingPaneRatios,
  saveWritingPaneVisibility,
  swapWritingPaneOrder,
  toggleWritingPaneVisibility,
  writingPaneDividerPair,
  writingPaneGridColumns
} from './research-writing-pane-ratios'

afterEach(() => localStorage.clear())

describe('Writing pane ratios', () => {
  it('moves only the two panes adjoining a divider and keeps readable minimum widths', () => {
    const left = resizeWritingPaneRatios(DEFAULT_WRITING_PANE_RATIOS, 0, 100, 1200)
    expect(left[0]).toBeGreaterThan(DEFAULT_WRITING_PANE_RATIOS[0])
    expect(left[1]).toBeLessThan(DEFAULT_WRITING_PANE_RATIOS[1])
    expect(left[2]).toBe(DEFAULT_WRITING_PANE_RATIOS[2])

    const farLeft = resizeWritingPaneRatios(DEFAULT_WRITING_PANE_RATIOS, 0, -1000, 1200)
    expect(farLeft[0] * 1188).toBeCloseTo(200)
    const farRight = resizeWritingPaneRatios(DEFAULT_WRITING_PANE_RATIOS, 1, 1000, 1200)
    expect(farRight[2] * 1188).toBeCloseTo(260)
    expect(farRight[0]).toBe(DEFAULT_WRITING_PANE_RATIOS[0])
  })

  it('restores each Experiment separately and ignores malformed stored layout', () => {
    const adjusted = resizeWritingPaneRatios(DEFAULT_WRITING_PANE_RATIOS, 0, 80, 1200)
    saveWritingPaneRatios('paper-a', adjusted)
    expect(readWritingPaneRatios('paper-a')).toEqual(adjusted)
    expect(readWritingPaneRatios('paper-b')).toEqual(DEFAULT_WRITING_PANE_RATIOS)
    localStorage.setItem('aster.research-writing-pane-ratios.v1:paper-a', '[99,0,-1]')
    expect(readWritingPaneRatios('paper-a')).toEqual(DEFAULT_WRITING_PANE_RATIOS)
  })

  it('stores visible panes per Experiment and always keeps one open', () => {
    const withoutSource = toggleWritingPaneVisibility(DEFAULT_WRITING_PANE_VISIBILITY, 1)
    expect(withoutSource).toEqual([true, false, true])
    saveWritingPaneVisibility('paper-a', withoutSource)
    expect(readWritingPaneVisibility('paper-a')).toEqual(withoutSource)
    expect(readWritingPaneVisibility('paper-b')).toEqual(DEFAULT_WRITING_PANE_VISIBILITY)

    const readerOnly = toggleWritingPaneVisibility(withoutSource, 0)
    expect(readerOnly).toEqual([false, false, true])
    expect(toggleWritingPaneVisibility(readerOnly, 2)).toBe(readerOnly)
    localStorage.setItem('aster.research-writing-pane-visibility.v1:paper-a', '[false,false,false]')
    expect(readWritingPaneVisibility('paper-a')).toEqual(DEFAULT_WRITING_PANE_VISIBILITY)
  })

  it('resizes adjacent visible panes even when the hidden pane sits between them', () => {
    const visible = [true, false, true] as const
    expect(writingPaneDividerPair(visible, 0)).toEqual([0, 2])
    expect(writingPaneDividerPair(visible, 1)).toBeNull()
    const columns = writingPaneGridColumns(DEFAULT_WRITING_PANE_RATIOS, visible)
    const fractions = [...columns.matchAll(/minmax\(0, ([\d.]+)fr\)/g)].map((match) =>
      Number(match[1])
    )
    expect(fractions).toHaveLength(2)
    expect(fractions[0] + fractions[1]).toBeCloseTo(1)
    expect(writingPaneGridColumns(DEFAULT_WRITING_PANE_RATIOS, [false, true, false])).toBe(
      'minmax(0, 1fr)'
    )
    const adjusted = resizeWritingPaneRatios(DEFAULT_WRITING_PANE_RATIOS, 0, 80, 1000, visible)
    expect(adjusted[0]).toBeGreaterThan(DEFAULT_WRITING_PANE_RATIOS[0])
    expect(adjusted[1]).toBe(DEFAULT_WRITING_PANE_RATIOS[1])
    expect(adjusted[2]).toBeLessThan(DEFAULT_WRITING_PANE_RATIOS[2])
  })

  it('saves an Experiment-specific pane order and uses it for dividers and widths', () => {
    const swapped = swapWritingPaneOrder(DEFAULT_WRITING_PANE_ORDER, 0, 2)
    expect(swapped).toEqual([2, 1, 0])
    saveWritingPaneOrder('paper-a', swapped)
    expect(readWritingPaneOrder('paper-a')).toEqual(swapped)
    expect(readWritingPaneOrder('paper-b')).toEqual(DEFAULT_WRITING_PANE_ORDER)
    expect(writingPaneDividerPair([true, true, true], 0, swapped)).toEqual([2, 1])
    expect(writingPaneGridColumns(DEFAULT_WRITING_PANE_RATIOS, [true, true, true], swapped)).toBe(
      'minmax(0, 0.38fr) 6px minmax(0, 0.38fr) 6px minmax(0, 0.24fr)'
    )
    const resized = resizeWritingPaneRatios(
      DEFAULT_WRITING_PANE_RATIOS,
      0,
      80,
      1200,
      [true, true, true],
      swapped
    )
    expect(resized[2]).toBeGreaterThan(DEFAULT_WRITING_PANE_RATIOS[2])
    expect(resized[1]).toBeLessThan(DEFAULT_WRITING_PANE_RATIOS[1])
    expect(resized[0]).toBe(DEFAULT_WRITING_PANE_RATIOS[0])

    localStorage.setItem('aster.research-writing-pane-order.v1:paper-a', '[0,0,2]')
    expect(readWritingPaneOrder('paper-a')).toEqual(DEFAULT_WRITING_PANE_ORDER)
  })

  it('restores three panes without squeezing a newly visible pane below its minimum', () => {
    const twoPane = resizeWritingPaneRatios(DEFAULT_WRITING_PANE_RATIOS, 0, -1000, 1200, [
      true,
      false,
      true
    ])
    const restored = constrainWritingPaneRatios(twoPane, 1200)
    expect(restored[0] * 1188).toBeGreaterThanOrEqual(200 - 0.001)
    expect(restored[1] * 1188).toBeGreaterThanOrEqual(420 - 0.001)
    expect(restored[2] * 1188).toBeGreaterThanOrEqual(260 - 0.001)
    expect(restored[0] + restored[1] + restored[2]).toBeCloseTo(1)
  })
})
