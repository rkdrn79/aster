// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ResearchEvidenceCheck } from './ResearchEvidenceCheck'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('runs the check only on request and shows the recorded evidence limits', async () => {
  const verify = vi.fn().mockResolvedValue({
    checkedAt: '2026-10-25T00:00:00.000Z',
    experiment: 'ablation',
    verdict: 'needs_review',
    runCount: 1,
    validation: { issueCount: 0, warningCount: 0, issues: [], warnings: [] },
    briefGaps: [{ experiment: 'ablation', missing: ['question'] }],
    unfinished: { count: 1, runs: [{ run: 'ablation/seed-42', state: 'unknown' }] },
    userReportedCount: 0,
    findings: { fail: 0, warn: 0, info: 0, open: [] }
  })
  vi.stubGlobal('api', { researchHarness: { verify } })
  render(
    <ResearchEvidenceCheck
      scope={{
        workspaceId: 'work',
        hostId: 'local',
        workspacePath: '/project',
        experiment: 'ablation'
      }}
    />
  )
  expect(verify).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Verify evidence' }))
  await waitFor(() => expect(screen.getByText('Needs review')).toBeTruthy())
  expect(verify).toHaveBeenCalledWith({ workspacePath: '/project', experiment: 'ablation' })
  expect(screen.getByText(/Brief \(ablation\): missing question/)).toBeTruthy()
  expect(screen.getByText(/Run ablation\/seed-42: unknown/)).toBeTruthy()
  expect(screen.getByText(/do not establish scientific validity/)).toBeTruthy()
})

it('reports an unavailable check without presenting an old success', async () => {
  const verify = vi.fn().mockRejectedValue(new Error('Project disconnected'))
  vi.stubGlobal('api', { researchHarness: { verify } })
  render(
    <ResearchEvidenceCheck
      scope={{
        workspaceId: 'work',
        hostId: 'local',
        workspacePath: '/project',
        experiment: 'ablation'
      }}
    />
  )
  fireEvent.click(screen.getByRole('button', { name: 'Verify evidence' }))
  await waitFor(() =>
    expect(screen.getByRole('alert').textContent).toContain('Project disconnected')
  )
  expect(screen.queryByText('Recorded checks clear')).toBeNull()
})
