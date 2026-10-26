// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ResearchHomeProject } from './research-home-projects'
import type { Tab } from '../../../../shared/tab-types'
import { useResearchSlackBackgroundTasks } from './research-slack-background-tasks'
import { researchHiddenTabIds } from './research-workbench-hidden-tabs'

const project: ResearchHomeProject = {
  key: 'project:streaming',
  name: 'ExamplePaper',
  badgeColor: null,
  projectGroupId: null,
  lastVisitedAt: 0,
  workspaces: [
    {
      id: 'workspace-1',
      executionHostId: 'runtime:research',
      name: 'ExamplePaper',
      path: '/srv/ExamplePaper',
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
  useResearchSlackBackgroundTasks.setState({ entries: [], errors: {} })
})

describe('remote Slack background task discovery', () => {
  it('keeps a coordinator out of Workbench until the user opens it, including after refresh', async () => {
    const getRemoteProjectTasks = vi.fn().mockResolvedValue({
      projectKey: project.key,
      workspacePath: '/srv/ExamplePaper',
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
      targetHostId: 'runtime:research',
      sessionId: 'codex-session-1'
    })
    expect(first?.workbenchVisible).toBeUndefined()
    const coordinatorTab: Tab = {
      id: 'structured-agent-session-codex-session-1',
      entityId: 'codex-session-1',
      groupId: 'group-1',
      worktreeId: 'workspace-1',
      executionHostId: 'runtime:research',
      contentType: 'agent-session',
      label: 'Slack coordinator',
      customLabel: null,
      color: null,
      sortOrder: 0,
      createdAt: 0
    }
    expect(
      researchHiddenTabIds([coordinatorTab], null, null, (tab) => tab.executionHostId ?? null, [
        first!
      ])
    ).toEqual([coordinatorTab.id])

    useResearchSlackBackgroundTasks.getState().setWorkbenchVisible(first!.id, true)
    await useResearchSlackBackgroundTasks.getState().refresh(project)
    expect(useResearchSlackBackgroundTasks.getState().entries[0]?.delegation).toMatchObject({
      id: first?.id,
      workbenchVisible: true
    })
  })

  it('discovers the routed coordinator on each project host even when another host fails', async () => {
    const bothHosts: ResearchHomeProject = {
      ...project,
      workspaces: [
        ...project.workspaces,
        {
          ...project.workspaces[0]!,
          id: 'workspace-2',
          executionHostId: 'ssh:other',
          path: '/work/ExamplePaper'
        }
      ]
    }
    const getRemoteProjectTasks = vi.fn().mockImplementation(({ executionHostId }) =>
      executionHostId === 'runtime:research'
        ? Promise.reject(new Error('Research host unreachable'))
        : Promise.resolve({
            projectKey: project.key,
            workspacePath: '/work/ExamplePaper',
            agent: 'codex',
            sessions: [
              {
                channelId: 'C456',
                threadTs: '1720000000.000002',
                sessionId: 'other-host-session'
              }
            ]
          })
    )
    vi.stubGlobal('window', { api: { researchSlack: { getRemoteProjectTasks } } })

    await expect(useResearchSlackBackgroundTasks.getState().refresh(bothHosts)).rejects.toThrow(
      'Research host unreachable'
    )
    expect(getRemoteProjectTasks).toHaveBeenCalledTimes(2)
    expect(useResearchSlackBackgroundTasks.getState().entries[0]?.delegation).toMatchObject({
      sessionId: 'other-host-session',
      targetWorkspaceId: 'workspace-2',
      targetHostId: 'ssh:other'
    })
    expect(useResearchSlackBackgroundTasks.getState().errors).toMatchObject({
      'runtime:research:project:streaming': 'Error: Research host unreachable'
    })
  })
})
