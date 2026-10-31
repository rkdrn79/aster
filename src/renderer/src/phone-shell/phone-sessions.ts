import type { AgentDotState } from '@/components/AgentStateDot'
import { dashboardCardDisplayState, type DashboardCard } from '../../../shared/dashboard-snapshot'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../shared/constants'
import type { ExecutionHostId } from '../../../shared/execution-host'
import type { Tab } from '../../../shared/tab-types'
import { resolveUnifiedTabLabel } from '../../../shared/tab-title-resolution'
import { toHostSessionTabId } from '../../../shared/terminal-surface-id'
import type { TerminalTab } from '../../../shared/terminal-tab-types'
import { formatAgentTypeLabel } from '../../../shared/agent-type-label'

// Why: a terminal that never set a title keeps the default label, which names nothing.
const DEFAULT_TERMINAL_LABEL = /^Terminal( \d+)?$/

/** The host's view of one terminal pane, from `terminal.list`, keyed by the host's tab id. */
export type PhoneTerminalPreview = {
  tabId: string
  leafId: string
  handle: string
  preview: string
  lastOutputAt: number | null
}

/** One terminal or agent tab as the phone lists it. */
export type PhoneSession = {
  worktreeId: string
  executionHostId?: ExecutionHostId
  tabId: string
  leafId: string | null
  contentType: 'terminal' | 'agent-session'
  title: string
  state: AgentDotState
  agentType: string | null
  /** The last thing worth reading: a pending question, the agent's reply, or terminal output. */
  detail: string
  activityAt: number
  /** When the agent entered its state; 0 for plain terminals. */
  stateSince: number
  /** False for a terminal tab the host no longer runs (its shell exited or the host restarted). */
  running: boolean
  /** A plain shell that sits at its prompt or no longer runs; lists fold these behind one row. */
  idleShell: boolean
}

// Why: questions and approvals first, then live work; finished and idle sessions sink.
const STATE_RANK: Record<AgentDotState, number> = {
  waiting: 0,
  blocked: 0,
  permission: 0,
  failed: 1,
  working: 2,
  monitoring: 2,
  unconfirmed: 3,
  interrupted: 3,
  done: 3,
  unverifiable: 4,
  idle: 4
}

export function phoneSessionNeedsYou(state: AgentDotState): boolean {
  return STATE_RANK[state] === 0
}

export function phoneSessionIsWorking(state: AgentDotState): boolean {
  return state === 'working' || state === 'monitoring'
}

function lastOutputLine(preview: string): string {
  const lines = preview.split('\n')
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index].trim()
    if (line) {
      return line.length > 160 ? `${line.slice(0, 157)}…` : line
    }
  }
  return ''
}

// Why these endings: sh/bash `$`, zsh `%`, root `#`, fish and PowerShell `>`, starship/oh-my-zsh glyphs.
const SHELL_PROMPT_END = /[$%#>❯➜»]$/

/** Whether a terminal shows nothing but its shell waiting for input. */
export function shellAtPrompt(preview: string): boolean {
  const last = preview.trimEnd().split('\n').at(-1)?.trim() ?? ''
  return last === '' || SHELL_PROMPT_END.test(last)
}

function mostUrgentCard(cards: readonly DashboardCard[]): DashboardCard | null {
  let best: DashboardCard | null = null
  for (const card of cards) {
    if (
      !best ||
      STATE_RANK[dashboardCardDisplayState(card)] < STATE_RANK[dashboardCardDisplayState(best)]
    ) {
      best = card
    }
  }
  return best
}

export function comparePhoneSessions(a: PhoneSession, b: PhoneSession): number {
  return (
    STATE_RANK[a.state] - STATE_RANK[b.state] ||
    Number(b.running) - Number(a.running) ||
    b.activityAt - a.activityAt
  )
}

/** Every terminal and agent tab across workspaces, with the agent state the dashboard derives. */
export function buildPhoneSessions(input: {
  tabsByWorktree: Readonly<Record<string, readonly Tab[]>>
  cards: readonly DashboardCard[]
  previews: ReadonlyMap<string, PhoneTerminalPreview>
  /** Whether `previews` holds a host answer yet; until then every terminal counts as running. */
  previewsLoaded: boolean
  /** The terminal rows, whose `launchAgent` names an agent before it ever reports status. */
  terminalTabsByWorktree: Readonly<
    Record<string, readonly Pick<TerminalTab, 'id' | 'launchAgent'>[]>
  >
  generatedTitlesEnabled: boolean
}): PhoneSession[] {
  const cardsByTab = new Map<string, DashboardCard[]>()
  for (const card of input.cards) {
    const key = `${card.worktreeId}\0${card.tabId}`
    cardsByTab.set(key, [...(cardsByTab.get(key) ?? []), card])
  }
  const sessions: PhoneSession[] = []
  for (const [worktreeId, tabs] of Object.entries(input.tabsByWorktree)) {
    if (worktreeId === FLOATING_TERMINAL_WORKTREE_ID) {
      continue
    }
    for (const tab of tabs) {
      if (tab.contentType !== 'terminal' && tab.contentType !== 'agent-session') {
        continue
      }
      const card = mostUrgentCard([
        ...(cardsByTab.get(`${worktreeId}\0${tab.id}`) ?? []),
        ...(tab.entityId === tab.id ? [] : (cardsByTab.get(`${worktreeId}\0${tab.entityId}`) ?? []))
      ])
      // Why: the web client mirrors host terminals as `web-terminal-<host tab id>` tabs.
      const preview = input.previews.get(toHostSessionTabId(tab.entityId))
      const launchAgent = input.terminalTabsByWorktree[worktreeId]?.find(
        (terminal) => terminal.id === tab.entityId
      )?.launchAgent
      const agentType = card?.agentType ?? tab.agentSessionAgent ?? launchAgent ?? null
      const label = resolveUnifiedTabLabel(
        tab,
        input.generatedTitlesEnabled,
        tab.contentType === 'agent-session' ? 'Agent' : 'Terminal'
      )
      // Why: structured agent sessions are not PTYs, so only terminals are checked against the host.
      const running =
        card !== null ||
        tab.contentType !== 'terminal' ||
        !input.previewsLoaded ||
        preview !== undefined
      const title =
        card?.conversationName ||
        (agentType && DEFAULT_TERMINAL_LABEL.test(label) ? formatAgentTypeLabel(agentType) : label)
      sessions.push({
        worktreeId,
        executionHostId: tab.executionHostId ?? card?.executionHostId,
        tabId: tab.id,
        leafId: card?.leafId ?? preview?.leafId ?? null,
        contentType: tab.contentType,
        title,
        state: card ? dashboardCardDisplayState(card) : 'idle',
        agentType,
        detail:
          card?.askSummary ||
          card?.lastAgentMessage ||
          card?.task ||
          lastOutputLine(preview?.preview ?? ''),
        activityAt: Math.max(
          card?.stateChangedAt ?? 0,
          preview?.lastOutputAt ?? 0,
          tab.lastFocusedAt ?? 0,
          tab.createdAt
        ),
        stateSince: card?.stateChangedAt ?? 0,
        running,
        idleShell:
          !agentType &&
          tab.contentType === 'terminal' &&
          (!running || (preview !== undefined && shellAtPrompt(preview.preview)))
      })
    }
  }
  return sessions.sort(comparePhoneSessions)
}
