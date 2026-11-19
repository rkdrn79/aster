import { useState } from 'react'
import { AlertTriangle, ArrowRight, Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { reviewerDisplayName } from '../../../../research-harness/research-rebuttal-assemble.mjs'
import { CharMeter, ResearchRebuttalAssemble } from './ResearchRebuttalAssemble'
import { ResearchRebuttalPaperChangeCard } from './ResearchRebuttalPaperChangeCard'
import { ResearchRebuttalPromises } from './ResearchRebuttalPromises'
import { ResearchRebuttalPaperChangesBar } from './ResearchRebuttalPaperChangesBar'
import {
  ResearchRebuttalRegroupList,
  ResearchRebuttalRemovedGroups
} from './ResearchRebuttalRegroups'
import { ResearchRebuttalWaitingChanges } from './ResearchRebuttalWaitingChanges'
import type { RebuttalSnapshot } from './research-rebuttal-snapshot'
import { useRebuttalTurns, REBUTTAL_TURN_ACTIVE } from './research-rebuttal-turns'
import { reviewerProgress } from './research-rebuttal-view'
import type { RebuttalActions } from './use-research-rebuttal-actions'
import { AnimatedCheck } from '@/components/ui/animated-check'
import { RAISED_CARD, SECTION_TITLE } from './research-surface-classes'

type Props = {
  snapshot: RebuttalSnapshot
  readOnly: boolean
  actions: RebuttalActions
  onOpenReviewer: (reviewerId: string) => void
}

/** Is this rebuttal ready to post, reviewer by reviewer, and what still blocks it. */
export function ResearchRebuttalFinish({
  snapshot,
  readOnly,
  actions,
  onOpenReviewer
}: Props): React.JSX.Element {
  const { bundle, proposals, paperChanges } = snapshot
  const { meta } = bundle
  const authorBusy = useRebuttalTurns((state) => {
    const turn = state.turns.author
    return Boolean(turn && REBUTTAL_TURN_ACTIVE.has(turn.phase))
  })
  const [error, setError] = useState<string | null>(null)
  const pendingPaper = paperChanges.filter((change) => change.status === 'pending')
  const waiting = proposals.filter((proposal) => !proposal.applied)
  const regroupsWaiting = snapshot.regroups.filter((record) => !record.applied).length
  const rows = meta.reviewers.map((reviewer) => ({
    reviewer,
    progress: reviewerProgress(snapshot, reviewer.id)
  }))
  const unwritten = rows.reduce((sum, row) => sum + (row.progress.total - row.progress.drafted), 0)
  const notReady = rows.reduce((sum, row) => sum + (row.progress.total - row.progress.ready), 0)
  const overLimit = rows.filter((row) => row.progress.over).map((row) => row.reviewer.id)
  const issues = [
    unwritten ? `${unwritten} ${unwritten === 1 ? 'reply' : 'replies'} not written` : null,
    notReady ? `${notReady} not marked ready` : null,
    overLimit.length ? `${overLimit.join(', ')} over the limit` : null,
    waiting.length
      ? `${waiting.length} agent ${waiting.length === 1 ? 'suggestion' : 'suggestions'} waiting`
      : null,
    regroupsWaiting
      ? `${regroupsWaiting} ${regroupsWaiting === 1 ? 'regroup' : 'regroups'} waiting`
      : null,
    pendingPaper.length
      ? `${pendingPaper.length} paper ${pendingPaper.length === 1 ? 'change' : 'changes'} to approve`
      : null
  ].filter(Boolean)

  return (
    <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-6 px-4 pt-2 pb-16">
        <section aria-label="Readiness" className={cn(RAISED_CARD, 'overflow-hidden')}>
          <header className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-4 pb-3">
            {issues.length ? (
              <AlertTriangle className="size-4 shrink-0 text-status-warning" aria-hidden />
            ) : (
              <span className="flex shrink-0 text-status-success">
                <AnimatedCheck className="size-4" />
              </span>
            )}
            <h2 className="min-w-0 flex-1 text-sm leading-5 font-medium">
              {issues.length
                ? issues.join(' · ')
                : 'Every reply is written, ready, and within its limit.'}
            </h2>
            {readOnly ? null : (
              <span className="flex items-center gap-1">
                <Button
                  size="xs"
                  variant="ghost"
                  disabled={authorBusy}
                  onClick={() =>
                    void actions.askAgent({ kind: 'draft', scope: { kind: 'all' } }).then(setError)
                  }
                >
                  Draft every open reply
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  disabled={authorBusy}
                  onClick={() => void actions.askAgent({ kind: 'limits' }).then(setError)}
                >
                  {authorBusy ? <Loader2 className="animate-spin" aria-hidden /> : null}
                  Fit replies into the limits
                </Button>
              </span>
            )}
          </header>
          <ul className="space-y-0.5 px-2 pb-2">
            {rows.map(({ reviewer, progress }) => (
              <li
                key={reviewer.id}
                className="grid grid-cols-[minmax(0,1.3fr)_auto_minmax(9rem,1fr)_auto] items-center gap-3 rounded-lg bg-muted/50 px-3 py-2 dark:bg-muted/40"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {reviewer.id}
                    {reviewerDisplayName(reviewer) === reviewer.id ? (
                      ''
                    ) : (
                      <span className="ml-2 font-normal text-muted-foreground">
                        {reviewerDisplayName(reviewer)}
                      </span>
                    )}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[
                      reviewer.rating ? `Score ${reviewer.rating}` : null,
                      reviewer.confidence ? `Confidence ${reviewer.confidence}` : null,
                      progress.predictionsOpen
                        ? `${progress.predictionsOpen} predicted${progress.predictionsStale ? `, ${progress.predictionsStale} stale` : ''}`
                        : null
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'No score recorded'}
                  </p>
                </div>
                <p
                  className={cn(
                    'inline-flex items-center gap-1 text-xs tabular-nums',
                    progress.ready < progress.total && 'text-muted-foreground'
                  )}
                >
                  {progress.total > 0 && progress.ready === progress.total ? (
                    <Check className="size-4 text-status-success" aria-hidden />
                  ) : null}
                  {progress.ready}/{progress.total} ready
                </p>
                <CharMeter chars={progress.chars} limit={progress.limit} />
                <Button size="xs" variant="ghost" onClick={() => onOpenReviewer(reviewer.id)}>
                  Open <ArrowRight aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
          {error ? (
            <p role="alert" className="px-4 pb-3 text-xs text-destructive">
              {error}
            </p>
          ) : null}
        </section>
        <ResearchRebuttalRegroupList
          records={snapshot.regroups}
          archive={snapshot.archive}
          readOnly={readOnly}
          actions={actions}
        />
        <ResearchRebuttalWaitingChanges
          proposals={proposals}
          readOnly={readOnly}
          actions={actions}
        />
        <ResearchRebuttalRemovedGroups
          archive={snapshot.archive}
          readOnly={readOnly}
          actions={actions}
        />
        <section aria-label="Replies to post" className="space-y-2">
          <h3 className={SECTION_TITLE}>Replies to post</h3>
          <ResearchRebuttalAssemble
            snapshot={snapshot}
            readOnly={readOnly}
            onUpdateMeta={actions.updateMeta}
            actions={actions}
          />
        </section>
        <section aria-label="Promises for the final version" className="space-y-2">
          <h3 className={SECTION_TITLE}>Promises for the final version</h3>
          {pendingPaper.length > 1 ? (
            <ResearchRebuttalPaperChangesBar
              changes={pendingPaper}
              readOnly={readOnly}
              onApplyAll={actions.approvePaperChanges}
            />
          ) : null}
          {pendingPaper.map((change) => (
            <ResearchRebuttalPaperChangeCard
              key={change.id}
              change={change}
              readOnly={readOnly}
              onApprove={() => actions.approvePaperChange(change.id)}
              onReject={() => actions.rejectPaperChange(change.id)}
              onOpen={null}
            />
          ))}
          <ResearchRebuttalPromises
            snapshot={snapshot}
            readOnly={readOnly}
            selectedClusterId={null}
            onUpdate={actions.updatePromises}
          />
        </section>
      </div>
    </div>
  )
}
