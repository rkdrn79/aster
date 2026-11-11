// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import {
  newRebuttalMeta,
  parseRebuttalMeta
} from '../../../../research-harness/research-rebuttal-model.mjs'
import type { OpenReviewForumReviews } from '../../../../shared/research/openreview-reviews'
import { ResearchRebuttalOpenReviewDialog } from './ResearchRebuttalOpenReviewDialog'
import type { RebuttalSnapshot } from './research-rebuttal-snapshot'

const mutations = vi.hoisted(() => ({
  saveRebuttalReview: vi.fn(async (_owner: unknown, input: { noteId?: string | null }) =>
    input.noteId === 'n1' ? 'R1' : 'R2'
  ),
  updateRebuttalMeta: vi.fn(async () => undefined)
}))
vi.mock('./research-rebuttal-mutations', () => mutations)

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

const snapshot: RebuttalSnapshot = {
  owner: { hostId: 'local', workspaceId: 'ws', workspacePath: '/project' },
  directory: '.aster/rebuttal/iclr',
  bundle: {
    meta: parseRebuttalMeta({
      ...newRebuttalMeta({ name: 'ICLR', now: '2026-11-07T00:00:00.000Z' }),
      reviewers: [{ id: 'R1', label: 'Reviewer Pq34', source: 'openreview', noteId: 'n1' }]
    }),
    points: [],
    clusters: [],
    promises: []
  },
  reviews: { R1: 'Old text.' },
  followUps: [],
  proposals: [],
  predictions: [],
  outlooks: [],
  paperChanges: [],
  translations: [],
  texts: {
    meta: null,
    points: null,
    clusters: null,
    promises: null,
    followUps: null,
    proposals: null,
    predictions: null,
    paperChanges: null,
    translations: null
  },
  issues: [],
  version: ''
}

const forum: OpenReviewForumReviews = {
  forum: 'Ab12Cd34',
  title: 'Sparse Diffusion Detectors',
  venue: 'ICLR 2025 Conference Submission',
  reviews: [
    {
      noteId: 'n1',
      label: 'Reviewer Pq34',
      rating: '3',
      confidence: '4',
      text: 'Weak.',
      createdAt: 1
    },
    {
      noteId: 'n2',
      label: 'Reviewer Xy12',
      rating: '6',
      confidence: '3',
      text: 'Fine.',
      createdAt: 2
    }
  ]
}

function open(fetchForum: () => Promise<OpenReviewForumReviews>) {
  vi.stubGlobal('api', { researchOpenReview: { fetchForum } })
  const onImported = vi.fn()
  const onOpenChange = vi.fn()
  render(
    <ResearchRebuttalOpenReviewDialog
      snapshot={snapshot}
      open
      onOpenChange={onOpenChange}
      onImported={onImported}
    />
  )
  fireEvent.change(screen.getByLabelText('OpenReview forum'), {
    target: { value: 'https://openreview.net/forum?id=Ab12Cd34' }
  })
  fireEvent.click(screen.getByRole('button', { name: 'Fetch reviews' }))
  return { onImported, onOpenChange }
}

it('imports the new reviews of a forum and keeps already imported ones unchecked', async () => {
  const { onImported, onOpenChange } = open(async () => forum)
  expect(await screen.findByText('Sparse Diffusion Detectors')).toBeTruthy()
  expect(screen.getByText(/imported as R1/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Import 1 review' }))
  await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  expect(mutations.saveRebuttalReview).toHaveBeenCalledTimes(1)
  expect(mutations.saveRebuttalReview).toHaveBeenCalledWith(snapshot.owner, {
    reviewerId: null,
    text: 'Fine.',
    label: 'Reviewer Xy12',
    rating: '6',
    confidence: '3',
    source: 'openreview',
    noteId: 'n2'
  })
  expect(mutations.updateRebuttalMeta).toHaveBeenCalled()
  expect(onImported).toHaveBeenCalledWith('R2')
})

it('explains that author-only reviews need to be pasted', async () => {
  open(async () => ({ ...forum, title: null, reviews: [] }))
  expect(await screen.findByText(/No reviews are public on this forum/)).toBeTruthy()
  expect(screen.queryByRole('button', { name: /^Import/ })).toBeNull()
})
