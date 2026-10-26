import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { slackProjectRouteId } from '../../shared/slack-project-route-binding'
import { saveState, statePath } from '../slack-bridge-state'
import { readSlackProjectTasks } from './slack-project-service'

const directories: string[] = []

afterEach(() => {
  for (const path of directories.splice(0)) {
    rmSync(path, { recursive: true, force: true })
  }
})

describe('Slack project background tasks', () => {
  it('finds the persisted coordinator of each authorized thread on the project server', () => {
    const root = mkdtempSync(join(tmpdir(), 'aster-slack-tasks-'))
    directories.push(root)
    mkdirSync(join(root, 'slack'))
    const route = {
      projectKey: 'streaming',
      projectName: 'StreamingVideo',
      workspacePath: '/srv/StreamingVideo',
      channelIds: ['C123'],
      allowedUsers: ['*'],
      agent: 'codex' as const
    }
    writeFileSync(
      join(root, 'slack', 'server-projects-v1.json'),
      JSON.stringify({ version: 1, routes: [route] })
    )
    const id = slackProjectRouteId(route)
    saveState(statePath(root, 'T123', 'UBOT'), {
      version: 1,
      threads: {
        [`${id}:T123:C123:1720000000.000001`]: 'codex-thread-a',
        [`${id}:T123:C999:1720000001.000001`]: 'wrong-channel',
        'other-route:T123:C123:1720000002.000001': 'wrong-project'
      },
      processed: []
    })
    expect(readSlackProjectTasks(root, 'streaming')).toEqual({
      projectKey: 'streaming',
      workspacePath: '/srv/StreamingVideo',
      agent: 'codex',
      sessions: [{ channelId: 'C123', threadTs: '1720000000.000001', sessionId: 'codex-thread-a' }]
    })
  })
})
