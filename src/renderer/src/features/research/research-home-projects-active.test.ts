import { describe, expect, it } from 'vitest'
import { findResearchActiveProject, type ResearchHomeProject } from './research-home-projects'

describe('active research workspace', () => {
  it('uses the selected host when two project workspaces have the same ID', () => {
    const workspace = {
      id: 'same-worktree',
      executionHostId: 'local' as const,
      name: 'StreamingVideo',
      path: '/local/StreamingVideo',
      branch: null,
      isMain: true,
      isFolder: false,
      repoId: 'repo-1',
      lastVisitedAt: 0
    }
    const project: ResearchHomeProject = {
      key: 'project:streaming',
      name: 'StreamingVideo',
      badgeColor: null,
      projectGroupId: null,
      lastVisitedAt: 0,
      workspaces: [
        workspace,
        { ...workspace, executionHostId: 'runtime:vip', path: '/srv/StreamingVideo' }
      ]
    }

    expect(
      findResearchActiveProject([project], workspace.id, 'runtime:vip').workspace
    ).toMatchObject({
      executionHostId: 'runtime:vip',
      path: '/srv/StreamingVideo'
    })
    expect(findResearchActiveProject([project], workspace.id, 'ssh:missing')).toEqual({
      project: null,
      workspace: null
    })
  })
})
