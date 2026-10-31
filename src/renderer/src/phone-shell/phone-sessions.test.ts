import { describe, expect, it } from 'vitest'
import type { DashboardCard } from '../../../shared/dashboard-snapshot'
import type { Tab } from '../../../shared/tab-types'
import { buildPhoneSessions, type PhoneTerminalPreview } from './phone-sessions'

const WORKTREE = 'repo::/work/proj'

function tab(id: string, label: string, createdAt: number): Tab {
  return {
    id,
    entityId: id,
    groupId: 'group',
    worktreeId: WORKTREE,
    contentType: 'terminal',
    label,
    customLabel: null,
    color: null,
    sortOrder: 0,
    createdAt
  }
}

function card(tabId: string, overrides: Partial<DashboardCard>): DashboardCard {
  return {
    paneKey: `${tabId}:leaf`,
    ptyId: null,
    agentType: 'claude',
    bucket: 'working',
    dotState: 'working',
    task: '',
    repoId: 'repo',
    worktreeId: WORKTREE,
    tabId,
    leafId: 'leaf',
    repoName: 'proj',
    worktreeName: 'main',
    startedAt: 0,
    finishedAt: null,
    stateChangedAt: 0,
    unseen: false,
    ...overrides
  }
}

function preview(tabId: string, text: string, lastOutputAt: number): PhoneTerminalPreview {
  return { tabId, leafId: 'leaf-1', handle: `term_${tabId}`, preview: text, lastOutputAt }
}

describe('buildPhoneSessions', () => {
  it('lists questions first, then live work, then terminals by latest output, then ended ones', () => {
    const sessions = buildPhoneSessions({
      tabsByWorktree: {
        [WORKTREE]: [
          tab('shell-old', 'old shell', 1),
          tab('agent-working', 'sweep', 2),
          tab('shell-new', 'new shell', 3),
          tab('agent-asking', 'review', 4),
          tab('shell-gone', 'gone shell', 100)
        ]
      },
      cards: [
        card('agent-working', { dotState: 'working', stateChangedAt: 50 }),
        card('agent-asking', { dotState: 'waiting', askSummary: 'Approve Bash: make' })
      ],
      previews: new Map([
        ['shell-old', preview('shell-old', 'a\nolder output\n', 10)],
        ['shell-new', preview('shell-new', 'newest output', 90)]
      ]),
      previewsLoaded: true,
      terminalTabsByWorktree: {},
      generatedTitlesEnabled: false
    })
    expect(
      sessions.map((session) => [session.title, session.state, session.detail, session.running])
    ).toEqual([
      ['review', 'waiting', 'Approve Bash: make', true],
      ['sweep', 'working', '', true],
      ['new shell', 'idle', 'newest output', true],
      ['old shell', 'idle', 'older output', true],
      ['gone shell', 'idle', '', false]
    ])
  })

  it('reads host previews for tabs the web client mirrors under a web-terminal id', () => {
    const [session] = buildPhoneSessions({
      tabsByWorktree: { [WORKTREE]: [tab('web-terminal-host-tab', 'clock', 1)] },
      cards: [],
      previews: new Map([['host-tab', preview('host-tab', 'tick', 5)]]),
      previewsLoaded: true,
      terminalTabsByWorktree: {},
      generatedTitlesEnabled: false
    })
    expect(session).toMatchObject({ detail: 'tick', leafId: 'leaf-1', activityAt: 5 })
  })

  it('folds plain shells at a prompt or gone, never agents or a shell still printing', () => {
    const sessions = buildPhoneSessions({
      tabsByWorktree: {
        [WORKTREE]: [
          tab('restored', 'restored shell', 1),
          tab('training', 'train', 2),
          tab('gone', 'gone shell', 3),
          tab('agent', 'Terminal', 4),
          tab('blank', 'blank shell', 5)
        ]
      },
      cards: [],
      previews: new Map([
        ['restored', preview('restored', 'Last login: Thu\n(base) me@host proj % \n\n', 1)],
        ['training', preview('training', 'step 400 val_acc=0.61', 2)],
        ['agent', preview('agent', 'me@host:~/proj$ ', 4)],
        ['blank', preview('blank', '', 5)]
      ]),
      previewsLoaded: true,
      terminalTabsByWorktree: { [WORKTREE]: [{ id: 'agent', launchAgent: 'claude' }] },
      generatedTitlesEnabled: false
    })
    expect(
      Object.fromEntries(sessions.map((session) => [session.tabId, session.idleShell]))
    ).toEqual({ restored: true, training: false, gone: true, agent: false, blank: true })
  })

  it('names a terminal by the agent it launched until the agent reports status', () => {
    const [session] = buildPhoneSessions({
      tabsByWorktree: { [WORKTREE]: [tab('launched', 'Terminal', 1)] },
      cards: [],
      previews: new Map(),
      previewsLoaded: false,
      terminalTabsByWorktree: { [WORKTREE]: [{ id: 'launched', launchAgent: 'codex' }] },
      generatedTitlesEnabled: false
    })
    expect(session).toMatchObject({ title: 'Codex', agentType: 'codex', state: 'idle' })
  })
})
