import { useState } from 'react'
import { Bot, Check, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { RebuttalReplyProposal } from '../../../../research-harness/research-rebuttal-records.mjs'
import { historyTimeText } from './research-rebuttal-view'
import type { RebuttalActions } from './use-research-rebuttal-actions'

type Group = {
  turn: string | null
  request: string
  at: string
  proposals: RebuttalReplyProposal[]
}

function groupByTurn(proposals: readonly RebuttalReplyProposal[]): Group[] {
  const groups = new Map<string, Group>()
  for (const proposal of proposals) {
    const key = proposal.turn ?? proposal.id
    const group = groups.get(key)
    if (group) {
      group.proposals.push(proposal)
    } else {
      groups.set(key, {
        turn: proposal.turn,
        request: proposal.request,
        at: proposal.at,
        proposals: [proposal]
      })
    }
  }
  return [...groups.values()]
}

function slotName(slot: string): string {
  if (slot.startsWith('opening:')) {
    return `Opening of ${slot.slice(8)}`
  }
  return slot === 'general:intro'
    ? 'General intro'
    : slot === 'general:closing'
      ? 'General closing'
      : slot
}

/** The agent's unreviewed work, one line per request, with Keep/Undo for the whole request. */
export function ResearchRebuttalWaitingChanges({
  proposals,
  readOnly,
  actions,
  compact = false
}: {
  proposals: readonly RebuttalReplyProposal[]
  readOnly: boolean
  actions: RebuttalActions
  compact?: boolean
}): React.JSX.Element | null {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const groups = groupByTurn(proposals)
  if (!groups.length) {
    return null
  }

  async function run(task: () => Promise<string | null>): Promise<void> {
    setBusy(true)
    setError(await task())
    setBusy(false)
  }

  return (
    <section aria-label="Agent changes to review" className="space-y-1.5">
      {compact ? null : <h3 className="text-xs font-semibold">Agent changes to review</h3>}
      <ul className="space-y-1">
        {groups.map((group) => {
          const ids = group.proposals.map((proposal) => proposal.id)
          const slots = group.proposals.map((proposal) => slotName(proposal.slot)).join(', ')
          const waiting = group.proposals.filter((proposal) => !proposal.applied).length
          return (
            <li
              key={group.turn ?? group.proposals[0].id}
              className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs"
            >
              <Bot className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">{group.request || 'Agent changes'}</span>
                <span className="text-muted-foreground">
                  {' '}
                  · {slots} · {historyTimeText(group.at)}
                </span>
              </span>
              {readOnly ? null : (
                <span className="flex items-center gap-1">
                  <Button
                    size="xs"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void run(() => actions.discardProposals(ids))}
                  >
                    <Undo2 aria-hidden /> Undo all
                  </Button>
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void run(() => actions.acceptProposals(ids))}
                  >
                    <Check aria-hidden /> {waiting ? 'Accept all' : 'Keep all'}
                  </Button>
                </span>
              )}
            </li>
          )
        })}
      </ul>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  )
}
