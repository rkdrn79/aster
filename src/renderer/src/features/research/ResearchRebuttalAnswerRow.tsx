import { useState } from 'react'
import { Bot, FilePenLine, History, Loader2, MoreHorizontal, PenLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import type {
  RebuttalClusterStatus,
  RebuttalReplyAuthor
} from '../../../../research-harness/research-rebuttal-model.mjs'
import type { RebuttalPaperChange } from '../../../../research-harness/research-rebuttal-records.mjs'
import type { RebuttalSnapshot } from './research-rebuttal-snapshot'
import { useRebuttalSlotBusy } from './research-rebuttal-turns'
import type { RebuttalAnswer } from './research-rebuttal-view'
import { ResearchRebuttalConcernColumn } from './ResearchRebuttalConcernColumn'
import { ResearchRebuttalDraftField } from './ResearchRebuttalDraftField'
import { ResearchRebuttalPaperChangeCard } from './ResearchRebuttalPaperChangeCard'
import { ResearchRebuttalProposalCard } from './ResearchRebuttalProposalCard'
import { ResearchRebuttalReviseButton } from './ResearchRebuttalReviseButton'
import { ResearchRebuttalVersionsDialog } from './ResearchRebuttalVersionsDialog'
import type { RebuttalActions } from './use-research-rebuttal-actions'

const STATUS_LABELS: Record<RebuttalClusterStatus, string> = {
  todo: 'To do',
  drafting: 'Drafting',
  done: 'Ready'
}

export function ReplyAuthorBadge({
  author,
  empty
}: {
  author: RebuttalReplyAuthor | null
  empty: boolean
}): React.JSX.Element | null {
  if (empty || !author) {
    return null
  }
  const icon = author === 'human' ? <PenLine aria-hidden /> : <Bot aria-hidden />
  const label =
    author === 'human' ? 'Written by you' : author === 'agent' ? 'Agent draft' : 'You and the agent'
  return (
    <span className="inline-flex items-center gap-1 text-2xs text-muted-foreground [&>svg]:size-3">
      {icon}
      {label}
    </span>
  )
}

type Props = {
  snapshot: RebuttalSnapshot
  reviewerId: string
  answer: RebuttalAnswer
  readOnly: boolean
  /** Concern above the reply instead of side by side. */
  stacked: boolean
  /** The reviewer who holds this shared answer in full, when it is not this reviewer. */
  homeReviewer: { id: string; name: string; answer: string } | null
  actions: RebuttalActions
  /** Open next-concern predictions this reply triggered, and whether any is stale. */
  predicted: { count: number; stale: boolean } | null
  onShowPredictions: () => void
}

/** One concern and its reply: the working unit of the rebuttal. */
export function ResearchRebuttalAnswerRow({
  snapshot,
  reviewerId,
  answer,
  readOnly,
  stacked,
  homeReviewer,
  actions,
  predicted,
  onShowPredictions
}: Props): React.JSX.Element {
  const { bundle } = snapshot
  const { cluster, points, label: answerLabel } = answer
  const slot = cluster?.id ?? null
  const reply = cluster?.response ?? ''
  const busy = useRebuttalSlotBusy(slot)
  const [selection, setSelection] = useState<string | null>(null)
  const [versionsOpen, setVersionsOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const proposal = slot ? (snapshot.proposals.find((entry) => entry.slot === slot) ?? null) : null
  const paperChanges: RebuttalPaperChange[] = slot
    ? snapshot.paperChanges.filter((change) => change.cluster === slot)
    : []
  const first = points[0]
  const title = cluster?.title || first?.summary || first?.quote || ''
  const links = cluster ? actions.linksFor(cluster) : null

  async function run(task: () => Promise<string | null>): Promise<void> {
    setError(await task())
  }

  return (
    <article
      aria-label={`${answerLabel}: ${title}`}
      data-answer={answerLabel}
      data-answer-points={points.map((point) => point.id).join(' ')}
      className="rounded-lg border border-border bg-card text-card-foreground"
    >
      <div
        className={cn('grid', stacked ? 'grid-cols-1' : 'grid-cols-[minmax(0,5fr)_minmax(0,7fr)]')}
      >
        <ResearchRebuttalConcernColumn
          answer={answer}
          reviewerId={reviewerId}
          stacked={stacked}
          readOnly={readOnly}
          links={links}
          bundle={bundle}
          actions={actions}
          onError={setError}
        />
        <div className="min-w-0 space-y-2 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <ReplyAuthorBadge author={cluster?.author ?? null} empty={!reply.trim()} />
            {predicted ? (
              <button
                type="button"
                className={cn(
                  'inline-flex items-center gap-1 rounded-sm bg-muted px-1 py-px text-2xs hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring',
                  predicted.stale ? 'text-status-warning' : 'text-muted-foreground'
                )}
                title="Next concerns the simulated reviewer predicted from this reply"
                onClick={onShowPredictions}
              >
                {predicted.count} predicted next
                {predicted.stale ? ' · reply changed' : ''}
              </button>
            ) : null}
            {busy ? (
              <span className="inline-flex items-center gap-1 text-2xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" aria-hidden /> Agent is working on this
              </span>
            ) : null}
            <div className="ml-auto flex items-center gap-1">
              {cluster ? (
                <ToggleGroup
                  type="single"
                  variant="outline"
                  size="xs"
                  value={cluster.status}
                  disabled={readOnly}
                  aria-label={`Status of ${answerLabel}`}
                  onValueChange={(value) => {
                    if (value === 'todo' || value === 'drafting' || value === 'done') {
                      void run(() => actions.changeCluster(cluster.id, { status: value }))
                    }
                  }}
                >
                  {(['todo', 'drafting', 'done'] as const).map((status) => (
                    <ToggleGroupItem key={status} value={status}>
                      {STATUS_LABELS[status]}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              ) : null}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon-xs" variant="ghost" aria-label={`More for ${answerLabel}`}>
                    <MoreHorizontal aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {slot && !readOnly ? (
                    <DropdownMenuItem
                      onSelect={() =>
                        void run(() =>
                          actions.askAgent({
                            kind: 'draft',
                            scope: { kind: 'cluster', clusterId: slot }
                          })
                        )
                      }
                    >
                      <Bot aria-hidden /> Draft with agent
                    </DropdownMenuItem>
                  ) : null}
                  {slot ? (
                    <DropdownMenuItem onSelect={() => setVersionsOpen(true)}>
                      <History aria-hidden /> Versions…
                    </DropdownMenuItem>
                  ) : null}
                  {slot && cluster?.action !== 'text' && !readOnly ? (
                    <DropdownMenuItem
                      onSelect={() =>
                        void run(() => actions.askAgent({ kind: 'paper-change', clusterId: slot }))
                      }
                    >
                      <FilePenLine aria-hidden /> Propose a paper change
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <ResearchRebuttalDraftField
            hideLabel
            label={`Reply to ${answerLabel}`}
            value={reply}
            readOnly={readOnly}
            rows={3}
            autoGrow
            placeholder={
              slot
                ? 'Write the reply here, or draft it with the agent. Answer first, then evidence.'
                : 'Start typing to answer this concern.'
            }
            onSelectionChange={setSelection}
            onSave={(text, base) => actions.saveReply(slot, first?.id ?? null, text, base)}
            footerExtra={
              readOnly ? null : (
                <span className="flex items-center gap-0.5">
                  {reply.trim() && slot ? (
                    <ResearchRebuttalReviseButton
                      passage={selection}
                      disabled={!slot}
                      onRevise={(passage, instruction) =>
                        actions.askAgent({ kind: 'revise', slot, passage, instruction })
                      }
                    />
                  ) : null}
                  {!reply.trim() && slot ? (
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        void run(() =>
                          actions.askAgent({
                            kind: 'draft',
                            scope: { kind: 'cluster', clusterId: slot }
                          })
                        )
                      }
                    >
                      <Bot aria-hidden /> Draft with agent
                    </Button>
                  ) : null}
                </span>
              )
            }
          />
          {homeReviewer ? (
            <p className="text-2xs leading-4 text-muted-foreground">
              The full answer goes to {homeReviewer.name} ({homeReviewer.answer}); this reply says
              “Please see our response to {homeReviewer.name}.” Change this in Finish.
            </p>
          ) : null}
          {proposal && slot ? (
            <ResearchRebuttalProposalCard
              proposal={proposal}
              current={reply}
              readOnly={readOnly}
              onAccept={() => actions.acceptProposal(proposal.id)}
              onDiscard={() => actions.discardProposal(proposal.id)}
            />
          ) : null}
          {paperChanges.map((change) => (
            <ResearchRebuttalPaperChangeCard
              key={change.id}
              change={change}
              readOnly={readOnly}
              onApprove={() => actions.approvePaperChange(change.id)}
              onReject={() => actions.rejectPaperChange(change.id)}
              onOpen={links?.onOpenWriting ?? null}
            />
          ))}
          {error ? (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      </div>
      {slot ? (
        <ResearchRebuttalVersionsDialog
          snapshot={snapshot}
          slot={slot}
          label={answerLabel}
          current={reply}
          open={versionsOpen}
          onOpenChange={setVersionsOpen}
        />
      ) : null}
    </article>
  )
}
