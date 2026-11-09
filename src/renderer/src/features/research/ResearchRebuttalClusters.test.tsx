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
import { ResearchRebuttalAssemble } from './ResearchRebuttalAssemble'
import { ResearchRebuttalClusters } from './ResearchRebuttalClusters'
import type { RebuttalSnapshot } from './research-rebuttal-snapshot'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const reviews = {
  R1: 'No comparison with DiffusionDet. What is tau?',
  R2: 'DiffusionDet should be compared. Typo in Eq. 3.'
}

function snapshot(
  responses: { C1?: string; C2?: string } = {},
  replyChars = 5000
): RebuttalSnapshot {
  const meta = parseRebuttalMeta({
    ...newRebuttalMeta({ name: 'ICLR 2027', now: '2026-11-07T00:00:00.000Z', replyChars }),
    reviewers: [
      { id: 'R1', label: '' },
      { id: 'R2', label: 'Reviewer Xy12' }
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
      { id: 'R1-Q1', kind: 'question', summary: 'What is tau', quote: 'What is tau?' },
      { id: 'R2-W1', kind: 'weakness', quote: 'DiffusionDet should be compared.' },
      {
        id: 'R2-M1',
        kind: 'minor',
        type: 'typo',
        summary: 'Typo in Eq. 3',
        quote: 'Typo in Eq. 3.'
      }
    ],
    { reviewers: meta.reviewers, reviews }
  )
  const clusters = parseClusters(
    [
      {
        id: 'C1',
        title: 'DiffusionDet baseline',
        points: ['R1-W1', 'R2-W1'],
        action: 'experiment',
        plan: 'Run it on COCO.',
        response: responses.C1
      },
      {
        id: 'C2',
        title: 'Temperature',
        points: ['R1-Q1'],
        action: 'clarify',
        response: responses.C2
      }
    ],
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

const noLinks = {
  experimentName: null,
  onOpenExperiment: null,
  onCreateExperiment: vi.fn(async () => null),
  onOpenWriting: null
}

it('shows each cluster with its point chips and drafts its answer in place', async () => {
  const onChangeCluster = vi.fn(async () => null)
  const onAgentRequest = vi.fn(async () => null)
  const onSelectCluster = vi.fn()
  const { rerender } = render(
    <ResearchRebuttalClusters
      snapshot={snapshot()}
      readOnly={false}
      selectedClusterId={null}
      onSelectCluster={onSelectCluster}
      linksFor={() => noLinks}
      onChangeCluster={onChangeCluster}
      onAgentRequest={onAgentRequest}
    />
  )
  expect(screen.getByText('2 clusters from 4 points')).toBeTruthy()
  const card = screen.getByRole('article', { name: 'C1: DiffusionDet baseline' })
  expect(within(card).getByText('R1-W1')).toBeTruthy()
  expect(within(card).getByText('R2-W1')).toBeTruthy()
  expect(within(card).getByText('New experiment')).toBeTruthy()
  expect(screen.getByText('Not grouped yet:')).toBeTruthy()
  fireEvent.click(within(card).getByRole('button', { expanded: false }))
  expect(onSelectCluster).toHaveBeenCalledWith('C1')

  rerender(
    <ResearchRebuttalClusters
      snapshot={snapshot()}
      readOnly={false}
      selectedClusterId="C1"
      onSelectCluster={onSelectCluster}
      linksFor={() => noLinks}
      onChangeCluster={onChangeCluster}
      onAgentRequest={onAgentRequest}
    />
  )
  expect(screen.getByText('Run it on COCO.')).toBeTruthy()
  const response = screen.getByLabelText('Response')
  fireEvent.change(response, { target: { value: 'We ran DiffusionDet: 45.1 AP.' } })
  fireEvent.blur(response)
  await waitFor(() =>
    expect(onChangeCluster).toHaveBeenCalledWith('C1', {
      response: 'We ran DiffusionDet: 45.1 AP.',
      status: 'drafting'
    })
  )
  fireEvent.click(screen.getByRole('button', { name: 'Create Experiment' }))
  await waitFor(() => expect(noLinks.onCreateExperiment).toHaveBeenCalled())
  fireEvent.click(screen.getByRole('button', { name: 'Draft with agent' }))
  await waitFor(() =>
    expect(onAgentRequest).toHaveBeenCalledWith({ kind: 'draft', clusterId: 'C1' })
  )
})

it('assembles per-reviewer replies with cross-references and character counts', async () => {
  const writeClipboardText = vi.fn(async () => undefined)
  vi.stubGlobal('api', { ui: { writeClipboardText } })
  render(
    <ResearchRebuttalAssemble
      snapshot={snapshot(
        { C1: 'DiffusionDet reaches 45.1 AP; ours 46.3.', C2: 'x'.repeat(120) },
        200
      )}
      readOnly={false}
      onUpdateMeta={vi.fn(async () => null)}
    />
  )
  const first = screen.getByRole('article', { name: 'Reply to R1' })
  expect(
    within(first).getByRole('meter', { name: 'Characters used' }).getAttribute('aria-valuemax')
  ).toBe('200')
  expect(within(first).getByText(/characters over the limit/)).toBeTruthy()
  const second = screen.getByRole('article', { name: 'Reply to Reviewer Xy12 (R2)' })
  expect(second.textContent).toContain('Please see our response to R1 (A1).')
  expect(within(second).getByText('No answer yet for R2-M1.')).toBeTruthy()
  fireEvent.click(within(second).getByRole('button', { name: 'Copy' }))
  await waitFor(() =>
    expect(writeClipboardText).toHaveBeenCalledWith(
      '**A1 (W1): DiffusionDet baseline**\nPlease see our response to R1 (A1).\n\n**A2 (M1)**\n[No response yet: Typo in Eq. 3]'
    )
  )
})
