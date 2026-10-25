import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { rmSync } from 'node:fs'
import { readProjectRoutes } from './slack'

let directory: string | null = null

afterEach(() => {
  if (directory) {
    rmSync(directory, { recursive: true, force: true })
  }
  directory = null
})

function file(routes: unknown[]): string {
  directory = mkdtempSync(join(tmpdir(), 'aster-slack-routes-'))
  const path = join(directory, 'connection.json')
  writeFileSync(path, JSON.stringify({ version: 1, encryptedCredentials: 'unread', routes }))
  return path
}

const route = {
  projectKey: 'project-a',
  projectName: 'Alpha',
  workspacePath: '/work/a',
  channelIds: ['C123'],
  allowedUsers: ['U123'],
  agent: 'codex'
}

describe('Slack route file', () => {
  it('maps a channel into its project workspace and coordinator', () => {
    expect(readProjectRoutes(file([route]))).toMatchObject([
      { projectName: 'Alpha', worktree: 'path:/work/a', agent: 'codex' }
    ])
  })

  it('refuses a channel assigned to two projects', () => {
    expect(() => readProjectRoutes(file([route, { ...route, projectKey: 'project-b' }]))).toThrow(
      'multiple project routes'
    )
  })
})
