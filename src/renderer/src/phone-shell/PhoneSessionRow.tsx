import { SquareTerminal } from 'lucide-react'
import { AgentIcon } from '@/lib/agent-catalog'
import { formatShortTimeAgo } from '@/lib/short-time-ago'
import { isTuiAgent } from '../../../shared/tui-agent-config'
import { phoneSessionStatus } from './phone-session-status'
import type { PhoneSession } from './phone-sessions'
import { openPhoneSession } from './phone-workbench-target'
import { PhoneRow, PhoneStatusPill } from './PhoneListLayout'

/** The muted line under a session: what it waits on or prints, then how long it has. */
function sessionSubtitle(session: PhoneSession, now: number, workspaceName?: string): string {
  const status = phoneSessionStatus(session)
  const elapsed =
    status.pill && session.stateSince > 0 ? formatShortTimeAgo(session.stateSince, now) : null
  const main = !session.running
    ? status.label
    : status.pill
      ? session.detail || status.label
      : session.detail || (session.agentType ? status.label : 'No output yet')
  // Why elapsed first: the detail truncates, and how long it has waited is the part to keep.
  return [workspaceName, elapsed, main].filter(Boolean).join(' · ')
}

/** One terminal or agent: its kind, its name, one status line, and a pill only when it matters. */
export function PhoneSessionRow({
  session,
  headerSubtitle,
  workspaceName,
  now
}: {
  session: PhoneSession
  /** Where the full-screen header says this session lives. */
  headerSubtitle: string
  /** Shown first in the status line when the project has several workspaces. */
  workspaceName?: string
  now: number
}): React.JSX.Element {
  const status = phoneSessionStatus(session)
  return (
    <PhoneRow
      data-phone-session-row=""
      onClick={() => openPhoneSession(session, headerSubtitle)}
      leading={
        session.agentType ? (
          <AgentIcon agent={isTuiAgent(session.agentType) ? session.agentType : null} size={18} />
        ) : (
          <SquareTerminal className="size-[18px]" aria-hidden />
        )
      }
      title={session.title}
      subtitle={sessionSubtitle(session, now, workspaceName)}
      trailing={
        status.pill ? (
          <PhoneStatusPill tone={status.pill.tone}>{status.pill.label}</PhoneStatusPill>
        ) : null
      }
    />
  )
}
