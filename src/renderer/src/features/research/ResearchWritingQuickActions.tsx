import type * as React from 'react'
import { ClipboardCheck, FlaskConical, ListTree, Scissors, ScrollText } from 'lucide-react'
import { ResearchChip } from './research-chip'
import { ResearchWritingCodeFolderPicker } from './ResearchWritingCodeFolderPicker'
import {
  WRITING_STARTER_ACTIONS,
  type WritingQuickAction,
  type WritingQuickActionId
} from './research-writing-quick-actions'

type Props = {
  owner: { hostId: string; workspacePath: string }
  actions: readonly WritingQuickAction[]
  sending: WritingQuickActionId | null
  onRun: (id: Exclude<WritingQuickActionId, 'method-from-code'>) => void
  onMethod: (folders: string[]) => Promise<string | null>
}

/** The chips above a bound Writing chat. */
export function ResearchWritingQuickChips({
  owner,
  actions,
  sending,
  onRun,
  onMethod
}: Props): React.JSX.Element {
  return (
    <div
      className="flex flex-wrap gap-2"
      role="group"
      aria-label="Writing requests"
      data-writing-quick-actions=""
    >
      {actions.map((action) =>
        action.id === 'method-from-code' ? (
          <ResearchWritingCodeFolderPicker
            key={action.id}
            owner={owner}
            label={action.label}
            disabledReason={action.disabledReason}
            sending={sending === action.id}
            onSend={onMethod}
          />
        ) : (
          <ResearchChip
            key={action.id}
            aria-label={action.label}
            data-writing-action={action.id}
            title={action.disabledReason ?? action.detail}
            disabled={sending !== null || action.disabledReason !== null}
            onClick={() => {
              if (action.id !== 'method-from-code') {
                onRun(action.id)
              }
            }}
          >
            {sending === action.id ? 'Sending…' : action.label}
          </ResearchChip>
        )
      )}
    </div>
  )
}

const STARTER_ICONS: Record<WritingQuickActionId, typeof ScrollText> = {
  'method-from-code': ScrollText,
  'intro-from-skeleton': ListTree,
  'results-from-runs': FlaskConical,
  tighten: Scissors,
  check: ClipboardCheck
}

function StarterCard({
  action,
  ...props
}: React.ComponentProps<'button'> & { action: WritingQuickAction }): React.JSX.Element {
  const Icon = STARTER_ICONS[action.id]
  return (
    <button
      type="button"
      aria-label={action.label}
      aria-disabled={action.disabledReason ? true : undefined}
      title={action.disabledReason ?? action.detail}
      data-writing-starter={action.id}
      className="press-scale flex w-full items-center gap-3 rounded-lg border border-border bg-card px-3 py-3 text-left hover:bg-accent focus-visible:outline-none aria-disabled:cursor-not-allowed aria-disabled:opacity-55"
      {...props}
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[13px] leading-tight font-medium text-foreground">
          {action.label}
        </span>
        <span className="text-xs leading-snug text-muted-foreground">
          {action.disabledReason ?? action.detail}
        </span>
      </span>
    </button>
  )
}

/** Before a chat exists: each drafting action starts one with its request. */
export function ResearchWritingStarters({
  owner,
  actions,
  sending,
  onRun,
  onMethod
}: Props): React.JSX.Element {
  const starters = actions.filter((action) => WRITING_STARTER_ACTIONS.includes(action.id))
  return (
    <div role="group" aria-label="Start writing" className="flex flex-col gap-2">
      {starters.map((action) =>
        action.id === 'method-from-code' ? (
          <ResearchWritingCodeFolderPicker
            key={action.id}
            owner={owner}
            label={action.label}
            disabledReason={action.disabledReason}
            sending={sending === action.id}
            onSend={onMethod}
            trigger={<StarterCard action={action} disabled={sending !== null} />}
          />
        ) : (
          <StarterCard
            key={action.id}
            action={action}
            disabled={sending !== null}
            onClick={() => {
              if (!action.disabledReason && action.id !== 'method-from-code') {
                onRun(action.id)
              }
            }}
          />
        )
      )}
    </div>
  )
}
