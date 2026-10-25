// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { ResearchMetricCurve } from './ResearchMetricCurve'

afterEach(cleanup)

const event = (x: number, value: number) => ({ x, metric: 'loss', split: 'train', value })

it('reads every visible run at the keyboard crosshair and hides runs from the legend', () => {
  render(
    <ResearchMetricCurve
      xLabel="step"
      valueLabel="loss / train"
      series={[
        { id: 'a', name: 'Baseline', events: [event(1, 0.9), event(2, 0.5)] },
        { id: 'b', name: 'Candidate', events: [event(1, 0.8), event(2, 0.25)] }
      ]}
    />
  )
  const chart = screen.getByRole('group', { name: /loss \/ train over step/ })
  fireEvent.keyDown(chart, { key: 'End' })
  expect(screen.getByText('step 2: Baseline 0.5000, Candidate 0.2500')).toBeTruthy()

  fireEvent.click(screen.getByRole('button', { name: /Candidate/, pressed: true }))
  fireEvent.keyDown(chart, { key: 'ArrowLeft' })
  expect(screen.getByText('step 1: Baseline 0.9000')).toBeTruthy()
})

it('keeps a reset run in separate segments and turns log scale off for non-positive values', () => {
  const { container } = render(
    <ResearchMetricCurve
      xLabel="step"
      series={[
        {
          id: 'run-1',
          name: 'Run 1',
          events: [event(1, 0.9), event(1, 0.7), event(2, 0.6), event(1, 0)]
        }
      ]}
    />
  )
  expect(container.querySelector('path')?.getAttribute('d')?.match(/M/g)).toHaveLength(2)
  expect(screen.getByRole('switch', { name: 'Log scale' }).hasAttribute('disabled')).toBe(true)
  expect(screen.getByText(/Repeated x-axis values show the last recorded value/)).toBeTruthy()
})
