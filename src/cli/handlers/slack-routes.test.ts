import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readProjectRoutes } from './slack'

const roots: string[] = []
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))

function read(routes: unknown[]) {
  const root = mkdtempSync(join(tmpdir(), 'aster-slack-routes-'))
  roots.push(root)
  const path = join(root, 'routes.json')
  writeFileSync(path, JSON.stringify({ version: 1, routes }))
  return readProjectRoutes(path)
}

const base = {
  projectKey: 'p',
  projectName: 'Project',
  workspacePath: '/data/project',
  channelIds: ['C123'],
  allowedUsers: ['U123'],
  agent: 'codex'
}

describe('Slack bridge project routes', () => {
  it('keeps a legacy local binding local', () => {
    expect(read([base])[0]).toMatchObject({ worktree: 'path:/data/project' })
    expect(read([base])[0].environmentId).toBeUndefined()
  })

  it('uses the remote workspace identity rather than the same path on this machine', () => {
    const [route] = read([
      {
        ...base,
        executionHostId: 'runtime:vip',
        workspaceId: 'repo::/data/project',
        environmentId: 'vip',
        hostKeyFingerprint: 'a'.repeat(64),
        runtimeId: 'remote-runtime'
      }
    ])
    expect(route).toMatchObject({
      worktree: 'id:repo::/data/project',
      environmentId: 'vip',
      runtimeId: 'remote-runtime'
    })
    expect(() => read([{ ...base, executionHostId: 'runtime:vip' }])).toThrow('paired runtime')
    expect(() => read([{ ...base, environmentId: 'vip' }])).toThrow('verified workspace')
  })
})
