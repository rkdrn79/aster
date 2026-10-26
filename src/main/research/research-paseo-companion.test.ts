import { describe, expect, it, vi } from 'vitest'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  getPaseoPhonePairingUrl,
  listPaseoHostAgents,
  listPaseoProjectAgents,
  parsePaseoHostAgents,
  parsePaseoProjectAgents,
  sendPaseoHostAgentMessage,
  sendPaseoProjectAgentMessage,
  setUpPaseoProjectDaemon
} from './research-paseo-companion'
import { listPaseoProjectProviders, startPaseoProjectAgent } from './research-paseo-agent-create'

const remoteCommand = vi.fn()
vi.mock('../ssh/targets/ssh-target-registry', () => ({
  listRegisteredSshTargets: () => [
    { id: 'ssh-research', orcadFence: { environmentId: 'research' } }
  ]
}))
vi.mock('./research-compute-transport', () => ({
  runResearchComputeCommand: (...args: unknown[]) => remoteCommand(...args)
}))

const agent = (id: string, cwd: string) => ({
  id,
  name: 'Reading paper',
  provider: 'codex/gpt-6',
  status: 'idle',
  cwd
})

describe('Paseo project agent scope', () => {
  it('resolves local Paseo home-relative cwd before showing a host agent', () => {
    const scope = {
      hostId: 'local',
      workspaceId: 'repo::/project',
      workspacePath: '/project'
    }
    const [entry] = parsePaseoHostAgents(
      JSON.stringify([agent('11111111-1111-1111-1111-111111111111', '~/projects/paper-project')]),
      scope
    )
    expect(entry?.cwd).toBe(join(homedir(), 'projects/paper-project'))
  })

  it('keeps agents outside the selected project in host inventory', () => {
    const root = '/srv/projects/research/PaperProject'
    const scope = { hostId: 'runtime:research', workspaceId: `repo::${root}`, workspacePath: root }
    expect(
      parsePaseoHostAgents(
        JSON.stringify([
          agent('11111111-1111-1111-1111-111111111111', root),
          agent('22222222-2222-2222-2222-222222222222', '/srv/projects/elsewhere')
        ]),
        scope
      ).map((entry) => entry.id)
    ).toEqual(['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'])
  })

  it('keeps only conversations in the selected SSH project', () => {
    const root = '/srv/projects/research/PaperProject'
    const agents = parsePaseoProjectAgents(
      JSON.stringify([
        agent('11111111-1111-1111-1111-111111111111', root),
        agent('22222222-2222-2222-2222-222222222222', `${root}/paper`),
        agent('33333333-3333-3333-3333-333333333333', `${root}-other`),
        agent('44444444-4444-4444-4444-444444444444', '/srv/projects/elsewhere')
      ]),
      { hostId: 'runtime:research', workspaceId: `repo::${root}`, workspacePath: root }
    )
    expect(agents.map((entry) => entry.id)).toEqual([
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222'
    ])
  })

  it('ignores malformed agent IDs and answers from other projects', () => {
    const agents = parsePaseoProjectAgents(
      JSON.stringify([
        agent('bad;command', '/project'),
        agent('11111111-1111-1111-1111-111111111111', '/project')
      ]),
      { hostId: 'runtime:research', workspaceId: 'repo::/project', workspacePath: '/project' }
    )
    expect(agents).toHaveLength(1)
  })

  it('uses the linked SSH host and streams messages to its Paseo daemon without shell arguments', async () => {
    const scope = {
      hostId: 'runtime:research',
      workspaceId: 'repo::/srv/projects/PaperProject',
      workspacePath: '/srv/projects/PaperProject'
    }
    const id = '11111111-1111-1111-1111-111111111111'
    remoteCommand.mockResolvedValueOnce({
      status: 'ok',
      stdout: JSON.stringify([agent(id, scope.workspacePath)])
    })
    remoteCommand.mockResolvedValueOnce({
      status: 'ok',
      stdout: JSON.stringify([agent(id, scope.workspacePath)])
    })
    remoteCommand.mockResolvedValueOnce({ status: 'ok', stdout: '{}' })
    expect(await listPaseoProjectAgents(scope)).toHaveLength(1)
    await sendPaseoProjectAgentMessage(scope, id, 'Check this result without changing files.')
    expect(remoteCommand).toHaveBeenCalledTimes(3)
    expect(remoteCommand.mock.calls[0]?.[0]).toBe('ssh-research')
    expect(remoteCommand.mock.calls[2]?.[4]).toBe('Check this result without changing files.')
    expect(String(remoteCommand.mock.calls[2]?.[2])).not.toContain('Check this result')
  })

  it('lists every agent on the selected SSH host through the same daemon', async () => {
    const scope = {
      hostId: 'runtime:research',
      workspaceId: 'repo::/srv/projects/PaperProject',
      workspacePath: '/srv/projects/PaperProject'
    }
    remoteCommand.mockResolvedValueOnce({
      status: 'ok',
      stdout: JSON.stringify([agent('11111111-1111-1111-1111-111111111111', '/other')])
    })
    await expect(listPaseoHostAgents(scope)).resolves.toHaveLength(1)
    expect(remoteCommand.mock.lastCall?.[0]).toBe('ssh-research')
  })

  it('continues a host agent outside the current project by its Paseo ID', async () => {
    const scope = {
      hostId: 'runtime:research',
      workspaceId: 'repo::/srv/projects/PaperProject',
      workspacePath: '/srv/projects/PaperProject'
    }
    const id = '11111111-1111-1111-1111-111111111111'
    remoteCommand.mockResolvedValueOnce({
      status: 'ok',
      stdout: JSON.stringify([agent(id, '/srv/projects/elsewhere')])
    })
    remoteCommand.mockResolvedValueOnce({ status: 'ok', stdout: '{}' })
    await sendPaseoHostAgentMessage(scope, id, 'Continue this thread.')
    expect(remoteCommand.mock.lastCall?.[4]).toBe('Continue this thread.')
    expect(String(remoteCommand.mock.lastCall?.[2])).toContain(`'${id}'`)
  })

  it('uses the selected host daemon for phone pairing', async () => {
    const scope = {
      hostId: 'runtime:research',
      workspaceId: 'repo::/srv/projects/PaperProject',
      workspacePath: '/srv/projects/PaperProject'
    }
    remoteCommand.mockResolvedValueOnce({
      status: 'ok',
      stdout: JSON.stringify({ url: 'paseo://pair/example', relayEnabled: true })
    })
    expect(await getPaseoPhonePairingUrl(scope)).toBe('paseo://pair/example')
    expect(remoteCommand.mock.lastCall?.[0]).toBe('ssh-research')
    expect(remoteCommand.mock.lastCall?.[2]).toContain("'daemon' 'pair' '--relay' '--json'")
  })

  it('installs a pinned Paseo CLI only when the selected server lacks one', async () => {
    const scope = {
      hostId: 'runtime:research',
      workspaceId: 'repo::/srv/projects/PaperProject',
      workspacePath: '/srv/projects/PaperProject'
    }
    remoteCommand.mockResolvedValueOnce({ status: 'error', message: 'PASEO_CLI_MISSING' })
    remoteCommand.mockResolvedValueOnce({ status: 'ok', stdout: '' })
    remoteCommand.mockResolvedValueOnce({ status: 'ok', stdout: 'Started' })
    await setUpPaseoProjectDaemon(scope)
    expect(String(remoteCommand.mock.calls.at(-2)?.[2])).toContain('@getpaseo/cli@0.12.0')
    expect(String(remoteCommand.mock.lastCall?.[2])).toContain("'daemon' 'start'")
  })

  it('starts a phone-visible agent in the selected project without putting its prompt in SSH arguments', async () => {
    const scope = {
      hostId: 'runtime:research',
      workspaceId: 'repo::/srv/projects/PaperProject',
      workspacePath: '/srv/projects/PaperProject'
    }
    const prompt = 'Review the latest results. Do not edit files.'
    const id = '55555555-5555-5555-5555-555555555555'
    remoteCommand.mockResolvedValueOnce({
      status: 'ok',
      stdout: JSON.stringify([
        { provider: 'codex', label: 'Codex', status: 'available', enabled: true },
        { provider: 'missing', label: 'Missing', status: 'unavailable', enabled: true }
      ])
    })
    await expect(listPaseoProjectProviders(scope)).resolves.toEqual([
      { id: 'codex', label: 'Codex' }
    ])
    remoteCommand.mockResolvedValueOnce({
      status: 'ok',
      stdout: JSON.stringify([{ provider: 'codex', label: 'Codex', status: 'available' }])
    })
    remoteCommand.mockResolvedValueOnce({
      status: 'ok',
      stdout: JSON.stringify({ agentId: id, status: 'running' })
    })
    await expect(startPaseoProjectAgent(scope, prompt, 'codex')).resolves.toBe(id)
    expect(remoteCommand.mock.lastCall?.[0]).toBe('ssh-research')
    expect(remoteCommand.mock.lastCall?.[4]).toBe(prompt)
    expect(String(remoteCommand.mock.lastCall?.[2])).not.toContain(prompt)
    expect(String(remoteCommand.mock.lastCall?.[2])).toContain("'/srv/projects/PaperProject'")
    expect(String(remoteCommand.mock.lastCall?.[2])).toContain("'codex'")
  })
})
