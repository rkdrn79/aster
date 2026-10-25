// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ResearchRunRecord } from '../../../../shared/research/research-records'
import type { ResearchRunSummary } from '../../../../shared/research/research-run-summary'
import { ResearchRunNotes } from './ResearchRunNotes'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const run: Pick<ResearchRunRecord, 'name' | 'hostId' | 'workspacePath' | 'manifestPath'> = {
  name: 'Seed 1',
  hostId: 'local',
  workspacePath: '/project',
  manifestPath: '/project/.aster/experiments/main/runs/seed-1/run.json'
}

it('saves on Enter through the organize bridge and shows the saved notes', async () => {
  const saved: ResearchRunSummary['notes'] = [
    { at: '2026-10-25T00:00:00.000Z', text: 'lr too high', by: 'user' }
  ]
  const addNote = vi.fn().mockResolvedValue({ notes: saved })
  vi.stubGlobal('api', { researchOrganize: { addNote } })
  render(<ResearchRunNotes run={run} notes={[]} />)
  const box = screen.getByRole('textbox', { name: 'Add a note' })

  fireEvent.change(box, { target: { value: 'lr too high' } })
  fireEvent.keyDown(box, { key: 'Enter', shiftKey: true })
  expect(addNote).not.toHaveBeenCalled()
  fireEvent.keyDown(box, { key: 'Enter' })

  await waitFor(() =>
    expect(addNote).toHaveBeenCalledWith({
      workspacePath: '/project',
      run: 'main/seed-1',
      text: 'lr too high'
    })
  )
  expect(await screen.findByText('lr too high')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Edit note' })).toBeTruthy()
})
