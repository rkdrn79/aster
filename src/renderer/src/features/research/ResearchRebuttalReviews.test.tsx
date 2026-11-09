// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import {
  newRebuttalMeta,
  parseRebuttalMeta
} from '../../../../research-harness/research-rebuttal-model.mjs'
import {
  parseClusters,
  parsePoints
} from '../../../../research-harness/research-rebuttal-points.mjs'
import { ResearchRebuttalReviews } from './ResearchRebuttalReviews'
import { reviewSegments } from './research-rebuttal-highlights'
import type { RebuttalSnapshot } from './research-rebuttal-snapshot'

afterEach(cleanup)

const reviews = {
  R1: 'Weaknesses: No comparison with DiffusionDet. The ablation is missing.',
  R2: 'DiffusionDet should be compared.'
}

function snapshot(): RebuttalSnapshot {
  const meta = parseRebuttalMeta({
    ...newRebuttalMeta({ name: 'ICLR 2027', now: '2026-11-07T00:00:00.000Z' }),
    reviewers: [
      { id: 'R1', label: 'Reviewer Pq34', rating: '3' },
      { id: 'R2', label: '' }
    ]
  })
  const points = parsePoints(
    [
      {
        id: 'R1-W1',
        kind: 'weakness',
        summary: 'No DiffusionDet',
        quote: 'No comparison with DiffusionDet.'
      },
      { id: 'R1-W2', kind: 'weakness', quote: 'The ablation is missing.' },
      { id: 'R2-W1', kind: 'weakness', quote: 'DiffusionDet should be compared.' }
    ],
    { reviewers: meta.reviewers, reviews }
  )
  const clusters = parseClusters(
    [{ id: 'C1', title: 'DiffusionDet', points: ['R1-W1', 'R2-W1'], action: 'experiment' }],
    { pointIds: points.map((point) => point.id) }
  )
  return {
    owner: { hostId: 'local', workspaceId: 'ws', workspacePath: '/project' },
    directory: '.aster/rebuttal/iclr-2027',
    bundle: { meta, points, clusters, promises: [] },
    reviews,
    texts: { meta: null, points: null, clusters: null, promises: null },
    issues: [],
    version: ''
  }
}

function renderReviews(overrides: Partial<Parameters<typeof ResearchRebuttalReviews>[0]> = {}) {
  const props = {
    snapshot: snapshot(),
    readOnly: false,
    reviewerId: 'R1',
    onReviewerChange: vi.fn(),
    selectedClusterId: null,
    onSelectCluster: vi.fn(),
    onSaveReview: vi.fn(async () => null),
    ...overrides
  }
  render(<ResearchRebuttalReviews {...props} />)
  return props
}

it('splits overlapping quotes into segments that know every point covering them', () => {
  const [first, second] = parsePoints(
    [
      { id: 'R1-W1', kind: 'weakness', quote: 'abc def' },
      { id: 'R1-W2', kind: 'weakness', quote: 'def ghi' }
    ],
    {
      reviewers: [
        {
          id: 'R1',
          label: '',
          rating: null,
          confidence: null,
          source: 'paste',
          noteId: null,
          opening: ''
        }
      ],
      reviews: { R1: 'abc def ghi' }
    }
  )
  const segments = reviewSegments('abc def ghi', [first, second])
  expect(segments.map((segment) => [segment.text, segment.points.map((p) => p.id)])).toEqual([
    ['abc ', ['R1-W1']],
    ['def', ['R1-W1', 'R1-W2']],
    [' ghi', ['R1-W2']]
  ])
})

it('highlights each point and selects its cluster from the point label', () => {
  const props = renderReviews({ selectedClusterId: 'C1' })
  const text = screen.getByTestId('rebuttal-review-text')
  const active = text.querySelector('[data-active-quote="true"]')
  expect(active?.textContent).toBe('No comparison with DiffusionDet.')
  expect(text.querySelector('[data-point-ids="R1-W2"]')?.className).toContain('decoration-dotted')
  fireEvent.click(within(text).getByRole('button', { name: 'R1-W1: No DiffusionDet' }))
  expect(props.onSelectCluster).toHaveBeenCalledWith('C1')
  fireEvent.click(within(text).getByRole('button', { name: 'R1-W2' }))
  expect(props.onSelectCluster).toHaveBeenLastCalledWith(null)
  expect(screen.getByText('Rating 3 · 2 points')).toBeTruthy()
})

it('pastes a new review and warns when an edit drops quoted points', async () => {
  const props = renderReviews({ reviewerId: null })
  fireEvent.change(screen.getByLabelText('Reviewer'), { target: { value: 'Reviewer Zz' } })
  fireEvent.change(screen.getByLabelText('Review'), { target: { value: 'New concerns.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Add review' }))
  await waitFor(() =>
    expect(props.onSaveReview).toHaveBeenCalledWith({
      reviewerId: null,
      text: 'New concerns.',
      label: 'Reviewer Zz'
    })
  )
  cleanup()

  renderReviews()
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
  fireEvent.change(screen.getByLabelText('Review'), {
    target: { value: 'Weaknesses: No comparison with DiffusionDet.' }
  })
  expect(screen.getByText(/Saving drops R1-W2/)).toBeTruthy()
})
