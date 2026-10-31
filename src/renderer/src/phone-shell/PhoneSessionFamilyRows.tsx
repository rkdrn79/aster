import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { orchestrationWorkerSummaryLabel } from '@/components/native-chat/native-chat-orchestration-workers'
import { cn } from '@/lib/utils'
import type { PhoneSession } from './phone-sessions'
import type { PhoneSessionFamily } from './phone-session-families'
import { PhoneSessionRow } from './PhoneSessionRow'

const SUBAGENT_NOUN = { one: 'subagent', other: 'subagents' }

/** A session row; when it launched subagents, a line under it that folds them out beneath it. */
export function PhoneSessionFamilyRows({
  family,
  headerSubtitleOf,
  workspaceNameOf,
  now
}: {
  family: PhoneSessionFamily
  headerSubtitleOf: (session: PhoneSession) => string
  workspaceNameOf: (session: PhoneSession) => string | undefined
  now: number
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const { session, subagents, subagentSummary } = family
  const row = (member: PhoneSession) => (
    <PhoneSessionRow
      key={`${member.worktreeId}\0${member.tabId}`}
      session={member}
      headerSubtitle={headerSubtitleOf(member)}
      workspaceName={workspaceNameOf(member)}
      now={now}
    />
  )
  if (!subagentSummary || subagents.length === 0) {
    return row(session)
  }
  return (
    <div data-phone-session-family="">
      {row(session)}
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((open) => !open)}
        className="-mt-2 flex min-h-9 w-full items-center gap-1 pr-4 pb-1 pl-13 text-left text-[13px] text-muted-foreground active:bg-accent"
        data-phone-subagents-toggle=""
      >
        <ChevronRight
          className={cn('size-3.5 shrink-0 transition-transform', expanded && 'rotate-90')}
          aria-hidden
        />
        <span className={cn('truncate', subagentSummary.waiting > 0 && 'text-agent-question-text')}>
          {orchestrationWorkerSummaryLabel(subagentSummary, SUBAGENT_NOUN)}
        </span>
      </button>
      {expanded ? (
        <div
          role="group"
          aria-label={`Subagents of ${session.title}`}
          className="ml-9 divide-y divide-border border-t border-border"
        >
          {subagents.map(row)}
        </div>
      ) : null}
    </div>
  )
}
