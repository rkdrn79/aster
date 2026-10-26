// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ResearchHomeProject } from './research-home-projects'
import { useResearchSlackBackgroundTasks } from './research-slack-background-tasks'

const project: ResearchHomeProject = {
  key: 'project:streaming',
  name: 'StreamingVideo',
  badgeColor: null,
  projectGroupId: null,
  lastVisitedAt: 0,
  workspaces: [
    {
      id: 'workspace-1',
      executionHostId: 'runtime:vip',
      name: 'StreamingVideo',
      path: '/srv/StreamingVideo',
      branch: null,
      isMain: true,
      isFolder: false,
      repoId: 'repo-1',
      lastVisitedAt: 0
    }
  ]
}

afterEach(() => {
  vi.unstubAllGlobals()
  useResearchSlackBackgroundTasks.setState({ entries: [] })
})

describe('remote Slack background task discovery', () => {
  it('keeps a coordinator out of Workbench until the user opens it, including after refresh', async () => {
    const getRemoteProjectTasks = vi.fn().mockResolvedValue({
      projectKey: project.key,
      workspacePath: '/srv/StreamingVideo',
      agent: 'codex',
      sessions: [
        {
          channelId: 'C123',
          threadTs: '1720000000.000001',
          sessionId: 'codex-session-1'
        }
      ]
    })
    vi.stubGlobal('window', { api: { researchSlack: { getRemoteProjectTasks } } })

    await useResearchSlackBackgroundTasks.getState().refresh(project)
    const first = useResearchSlackBackgroundTasks.getState().entries[0]?.delegation
    expect(first).toMatchObject({
      targetWorkspaceId: 'workspace-1',
      targetHostId: 'runtime:vip',
      sessionId: 'codex-session-1'
    })
    expect(first?.workbenchVisible).toBeUndefined()

    useResearchSlackBackgroundTasks.getState().setWorkbenchVisible(first!.id, true)
    await useResearchSlackBackgroundTasks.getState().refresh(project)
    expect(useResearchSlackBackgroundTasks.getState().entries[0]?.delegation).toMatchObject({
      id: first?.id,
      workbenchVisible: true
    })
  })
})
