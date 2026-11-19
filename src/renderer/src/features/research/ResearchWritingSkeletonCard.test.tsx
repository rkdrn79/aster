// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type {
  WritingCheckResult,
  WritingSkeleton
} from '../../../../shared/research/research-writing-results'
import { ResearchWritingCheckPanel } from './ResearchWritingCheckPanel'
import { ResearchWritingSkeletonCard } from './ResearchWritingSkeletonCard'

afterEach(cleanup)

const draft: WritingSkeleton = {
  section: 'intro',
  path: '.aster/writing/intro.skeleton.md',
  status: 'draft',
  lines: [
    {
      key: 'GAP',
      text: 'Streaming LLMs collapse past the training length (Fig. 1).',
      required: true
    },
    {
      key: 'WHY-NOT',
      text: 'Window attention collapses once the first tokens leave.',
      required: true
    },
    { key: 'INSIGHT', text: 'Models park attention on the first tokens.', required: true },
    { key: 'APPROACH', text: 'Keep four initial tokens beside a rolling window.', required: true },
    { key: 'EVIDENCE', text: '', required: true }
  ],
  missing: ['EVIDENCE'],
  notes: '',
  updatedAt: '2026-11-17T01:00:00.000Z',
  updatedBy: 'agent',
  confirmedAt: null,
  confirmedBy: null
}

it('confirms a skeleton only once every line is filled, sending the edits with it', async () => {
  const onConfirm = vi.fn(async (_lines: Record<string, string> | null) => null)
  render(
    <ResearchWritingSkeletonCard
      skeleton={draft}
      onSave={vi.fn(async () => null)}
      onConfirm={onConfirm}
      onDismiss={vi.fn()}
    />
  )
  expect(screen.getByText('Waiting for your confirmation')).toBeTruthy()
  const confirm = screen.getByRole('button', { name: 'Confirm skeleton' })
  expect(confirm.hasAttribute('disabled')).toBe(true)
  expect(screen.getByText('Fill in Evidence first.')).toBeTruthy()
  fireEvent.change(screen.getByRole('textbox', { name: 'Evidence' }), {
    target: { value: 'Stable perplexity to 4M tokens (claim c3).' }
  })
  expect(confirm.hasAttribute('disabled')).toBe(false)
  fireEvent.click(confirm)
  await waitFor(() => expect(onConfirm).toHaveBeenCalledOnce())
  expect(onConfirm.mock.calls[0]?.[0]).toMatchObject({
    GAP: draft.lines[0]?.text,
    EVIDENCE: 'Stable perplexity to 4M tokens (claim c3).'
  })
  // Confirmed, the card folds into one line with Edit.
  await waitFor(() => expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy())
})

it('lists check findings by section and jumps to the line of the one clicked', () => {
  const result: WritingCheckResult = {
    manuscript: 'paper/main.tex',
    files: ['paper/main.tex'],
    fragment: false,
    bibliography: null,
    claims: null,
    summary: { errors: 1, warnings: 1, notes: 0 },
    sections: [
      {
        role: 'intro',
        title: 'Introduction',
        file: 'paper/main.tex',
        line: 12,
        endLine: 40,
        profile: {},
        score: 81,
        errors: [
          {
            code: 'WC-CITE-KEY',
            id: null,
            message: '\\cite{smith2020} is not in the bibliography.',
            fix: 'Use a key from writing bib or \\cite{TODO:…}.',
            file: 'paper/main.tex',
            line: 30,
            column: 4,
            span: 'smith2020',
            paragraph: 3
          }
        ],
        warnings: [
          {
            code: 'WC-SUPERLATIVE',
            id: null,
            message: 'Superlative without a scope.',
            fix: null,
            file: 'paper/main.tex',
            line: 18,
            column: null,
            span: null,
            paragraph: 2
          }
        ],
        notes: []
      }
    ]
  }
  const onOpenSource = vi.fn()
  const view = render(
    <ResearchWritingCheckPanel
      check={{ available: true, result, error: null, checking: false, recheck: vi.fn() }}
      onOpenSource={onOpenSource}
      onClose={vi.fn()}
      onAskAgent={vi.fn(async () => null)}
    />
  )
  const rows = [...view.container.querySelectorAll('[data-writing-finding]')].map((row) =>
    row.getAttribute('data-writing-finding')
  )
  expect(rows).toEqual(['WC-CITE-KEY', 'WC-SUPERLATIVE'])
  fireEvent.click(screen.getByText('Superlative without a scope.'))
  expect(onOpenSource).toHaveBeenCalledWith('paper/main.tex', 18)
  expect(screen.getByRole('button', { name: 'Ask Writing agent to fix' })).toBeTruthy()
})
