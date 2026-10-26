import { describe, expect, it } from 'vitest'
import type { ExperimentRecord } from '../../../../shared/research/research-records'
import { projectWritingRecordId } from './research-writing-project'
import { writingAgentFocusMatches } from './useWritingAgentFocus'

const owner: ExperimentRecord = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'First Experiment',
  projectId: null,
  workspaceId: 'project-workspace',
  workspacePath: '/paper',
  hostId: 'ssh:vip',
  archived: false,
  createdAt: '2026-10-24T00:00:00Z',
  updatedAt: '2026-10-24T00:00:00Z'
}

describe('Writing agent focus', () => {
  it('accepts project focus before and after its first Experiment is created', () => {
    const projectId = projectWritingRecordId(owner)
    const projectOnly = { ...owner, id: projectId }
    expect(writingAgentFocusMatches(projectOnly, projectId, [])).toBe(true)
    expect(writingAgentFocusMatches(owner, projectId, [owner])).toBe(true)
  })

  it('keeps project focus after its former Writing owner is archived or removed', () => {
    const replacement = { ...owner, id: '22222222-2222-4222-8222-222222222222' }
    const projectId = projectWritingRecordId(owner)
    expect(
      writingAgentFocusMatches(replacement, projectId, [{ ...owner, archived: true }, replacement])
    ).toBe(true)
    expect(writingAgentFocusMatches(replacement, projectId, [replacement])).toBe(true)
    expect(
      writingAgentFocusMatches(replacement, owner.id, [{ ...owner, archived: true }, replacement])
    ).toBe(false)
  })
})
