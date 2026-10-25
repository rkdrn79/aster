import { describe, expect, it } from 'vitest'
import type { Tab } from '../../../../shared/tab-types'
import type { TerminalTab } from '../../../../shared/terminal-tab-types'
import { collectProjectAgentGroups } from './research-project-agent-groups'

function agentTab(id: string, worktreeId: string): Tab {
  return {
    id,
    entityId: id,
    groupId: 'group',
    worktreeId,
    executionHostId: 'local',
    contentType: 'agent-session',
    label: id,
    customLabel: null,
    color: null,
    sortOrder: 0,
    createdAt: 0
  }
}

describe('project agent groups', () => {
  it('keeps agents in both the original and newly selected worktree', () => {
    const groups = collectProjectAgentGroups(
      [
        { id: 'main', name: 'main', branch: 'main', executionHostId: 'local', isMain: true },
        {
          id: 'branch',
          name: 'experiment',
          branch: 'experiment',
          executionHostId: 'local',
          isMain: false
        }
      ],
      { main: [agentTab('original', 'main')], branch: [agentTab('new', 'branch')] },
      {},
      () => 'local'
    )
    expect(groups.map((group) => group.tabs.map((tab) => tab.id))).toEqual([['original'], ['new']])
  })

  it('includes launched CLI agents, but excludes ordinary terminals and other hosts', () => {
    const terminal = {
      ...agentTab('terminal-agent', 'main'),
      contentType: 'terminal' as const
    }
    const terminalRecord: TerminalTab = {
      id: 'terminal-agent',
      worktreeId: 'main',
      ptyId: null,
      title: 'Claude',
      customTitle: null,
      color: null,
      sortOrder: 0,
      createdAt: 0,
      launchAgent: 'claude'
    }
    const groups = collectProjectAgentGroups(
      [{ id: 'main', name: 'main', branch: 'main', executionHostId: 'local', isMain: true }],
      {
        main: [
          terminal,
          { ...terminal, id: 'ordinary', entityId: 'ordinary' },
          { ...agentTab('remote', 'main'), executionHostId: 'ssh:other' }
        ]
      },
      { main: [terminalRecord] },
      () => 'local'
    )
    expect(groups[0].tabs.map((tab) => tab.id)).toEqual(['terminal-agent'])
  })

  it('keeps workspace groups in the same order when visit recency changes', () => {
    const main = {
      id: 'main',
      name: 'main',
      branch: 'main',
      executionHostId: 'local' as const,
      isMain: true
    }
    const alpha = {
      id: 'alpha',
      name: 'alpha',
      branch: 'alpha',
      executionHostId: 'local' as const,
      isMain: false
    }
    const beta = {
      id: 'beta',
      name: 'beta',
      branch: 'beta',
      executionHostId: 'local' as const,
      isMain: false
    }
    const tabs = {
      main: [agentTab('main-agent', 'main')],
      alpha: [agentTab('alpha-agent', 'alpha')],
      beta: [agentTab('beta-agent', 'beta')]
    }
    const ids = (workspaces: (typeof main)[]) =>
      collectProjectAgentGroups(workspaces, tabs, {}, () => 'local').map((group) =>
        group.tabs.map((tab) => tab.id)
      )

    expect(ids([beta, main, alpha])).toEqual(ids([alpha, beta, main]))
    expect(ids([beta, main, alpha])).toEqual([['main-agent'], ['alpha-agent'], ['beta-agent']])
  })
})
