// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

const project = {
  key: 'project:streaming',
  name: 'StreamingVideo',
  workspaces: [
    {
      id: 'workspace-1',
      executionHostId: 'runtime:vip',
      path: '/srv/StreamingVideo'
    }
  ]
}

vi.mock('./research-home-projects', () => ({
  useResearchActiveProject: () => ({ project, workspace: project.workspaces[0] })
}))

import { ResearchSlackBackgroundTaskMonitor } from './ResearchSlackBackgroundTaskMonitor'
import { useResearchSlackBackgroundTasks } from './research-slack-background-tasks'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  useResearchSlackBackgroundTasks.setState({ entries: [] })
})

it('discovers new Slack coordinators without a mounted Workbench conversation list', async () => {
  vi.useFakeTimers()
  const getRemoteProjectTasks = vi
    .fn()
    .mockResolvedValueOnce({
      projectKey: project.key,
      workspacePath: '/srv/StreamingVideo',
      agent: 'codex',
      sessions: []
    })
    .mockResolvedValue({
      projectKey: project.key,
      workspacePath: '/srv/StreamingVideo',
      agent: 'codex',
      sessions: [
        {
          channelId: 'C123',
          threadTs: '1720000000.000001',
          sessionId: 'slack-session'
        }
      ]
    })
  vi.stubGlobal('window', { api: { researchSlack: { getRemoteProjectTasks } } })

  render(<ResearchSlackBackgroundTaskMonitor />)
  await act(async () => getRemoteProjectTasks.mock.results[0]?.value)
  expect(getRemoteProjectTasks).toHaveBeenCalledOnce()
  expect(useResearchSlackBackgroundTasks.getState().entries).toEqual([])

  await act(async () => vi.advanceTimersByTimeAsync(5_000))
  expect(getRemoteProjectTasks).toHaveBeenCalledTimes(2)
  expect(useResearchSlackBackgroundTasks.getState().entries[0]?.delegation.sessionId).toBe(
    'slack-session'
  )
})
