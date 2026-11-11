import { useEffect, useRef, useState } from 'react'
import { Bot, Lightbulb, Loader2, MessageCirclePlus, MoreHorizontal, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
  reviewerDisplayName,
  planReviewerReplies
} from '../../../../research-harness/research-rebuttal-assemble.mjs'
import type { RebuttalReviewer } from '../../../../research-harness/research-rebuttal-model.mjs'
import { ResearchRebuttalAnswerRow } from './ResearchRebuttalAnswerRow'
import { ResearchRebuttalFollowUpDialog } from './ResearchRebuttalFollowUpDialog'
import { ResearchRebuttalPredictions } from './ResearchRebuttalPredictions'
import { ResearchRebuttalTurnChips } from './ResearchRebuttalTurnChips'
import { CharMeter } from './ResearchRebuttalAssemble'
import { useRebuttalTurns, REBUTTAL_TURN_ACTIVE } from './research-rebuttal-turns'
import type { RebuttalSnapshot } from './research-rebuttal-snapshot'
import {
  openPredictions,
  reviewerAnswers,
  reviewerProgress,
  reviewerRounds
} from './research-rebuttal-view'
import { predictionIsStale } from '../../../../research-harness/research-rebuttal-records.mjs'
import type { RebuttalAnswer } from './research-rebuttal-view'
import type { RebuttalActions } from './use-research-rebuttal-actions'

type Props = {
  snapshot: RebuttalSnapshot
  reviewer: RebuttalReviewer
  readOnly: boolean
  stacked: boolean
  actions: RebuttalActions
  onEditReview: () => void
  onOpenDebate: () => void
}

/** Everything for one reviewer: their concerns next to the replies, round by round. */
export function ResearchRebuttalReviewerView({
  snapshot,
  reviewer,
  readOnly,
  stacked,
  actions,
  onEditReview,
  onOpenDebate
}: Props): React.JSX.Element {
  const { bundle } = snapshot
  const progress = reviewerProgress(snapshot, reviewer.id)
  const rounds = reviewerRounds(bundle, reviewer.id)
  const [followUpOpen, setFollowUpOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const actor = `reviewer:${reviewer.id}` as const
  const predicting = useRebuttalTurns((state) => {
    const turn = state.turns[actor]
    return Boolean(
      turn && turn.request.startsWith('Predict') && REBUTTAL_TURN_ACTIVE.has(turn.phase)
    )
  })
  const followUps = snapshot.followUps.filter((entry) => entry.reviewer === reviewer.id)
  const predictions = openPredictions(snapshot, reviewer.id)
  const predictionsSection = useRef<HTMLDivElement | null>(null)
  const scrollToPredictions = (): void =>
    predictionsSection.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  // Why: a finished prediction arrives below the replies; bring it into view when it lands.
  const wasPredicting = useRef(false)
  const hasPredictions = predictions.length > 0
  useEffect(() => {
    if (wasPredicting.current && !predicting && hasPredictions) {
      scrollToPredictions()
    }
    wasPredicting.current = predicting
  }, [predicting, hasPredictions])
  const facts = [
    reviewer.rating ? `Score ${reviewer.rating}` : null,
    reviewer.confidence ? `Confidence ${reviewer.confidence}` : null,
    reviewer.source === 'openreview' ? 'OpenReview' : 'Pasted'
  ].filter(Boolean)

  async function run(task: () => Promise<string | null>): Promise<void> {
    setError(await task())
  }

  return (
    <section
      aria-label={`Reviewer ${reviewer.id}`}
      className="scrollbar-sleek flex min-h-0 flex-1 flex-col overflow-y-auto"
    >
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border bg-background px-4 py-2">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-baseline gap-2">
            <h2 className="truncate text-sm font-semibold">{reviewerDisplayName(reviewer)}</h2>
            <span className="truncate text-xs text-muted-foreground">{facts.join(' · ')}</span>
          </div>
          {!progress.total ? null : (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-muted-foreground">
              <span>
                {progress.ready}/{progress.total} ready · {progress.drafted}/{progress.total}{' '}
                written
              </span>
              {progress.waiting ? (
                <span>
                  {progress.waiting} agent {progress.waiting === 1 ? 'suggestion' : 'suggestions'}{' '}
                  waiting
                </span>
              ) : null}
              <span className="w-44 max-w-full">
                <CharMeter chars={progress.chars} limit={progress.limit} />
              </span>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {predictions.length ? (
            <Button size="xs" variant="ghost" onClick={scrollToPredictions}>
              <Lightbulb aria-hidden /> {predictions.length} predicted next
              {predictions.some((prediction) => predictionIsStale(bundle, prediction))
                ? ' · changed'
                : ''}
            </Button>
          ) : null}
          <ResearchRebuttalTurnChips actor={actor} />
          <ResearchRebuttalTurnChips actor="author" />
          {!readOnly ? (
            <>
              <Button
                size="xs"
                variant="ghost"
                disabled={!progress.total}
                onClick={() =>
                  void run(() =>
                    actions.askAgent({
                      kind: 'draft',
                      scope: { kind: 'reviewer', reviewerId: reviewer.id }
                    })
                  )
                }
              >
                <Bot aria-hidden /> Draft {reviewer.id}&apos;s replies
              </Button>
              <Button
                size="xs"
                variant="outline"
                disabled={predicting || !progress.drafted}
                title={
                  progress.drafted
                    ? "Ask this reviewer's simulated agent what it would raise next"
                    : 'Write a reply first'
                }
                onClick={() => {
                  onOpenDebate()
                  void run(() => actions.askReviewer(reviewer.id, 'predict'))
                }}
              >
                {predicting ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : (
                  <Lightbulb aria-hidden />
                )}
                Predict next concerns
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon-xs" variant="ghost" aria-label={`More for ${reviewer.id}`}>
                    <MoreHorizontal aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setFollowUpOpen(true)}>
                    <MessageCirclePlus aria-hidden /> Add a new round…
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={onEditReview}>
                    <Pencil aria-hidden /> Edit this review…
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : null}
        </div>
        {error ? (
          <p role="alert" className="w-full text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </header>
      <div className="space-y-5 p-4 pb-16">
        {progress.total === 0 && !bundle.points.some((point) => point.reviewer === reviewer.id) ? (
          <div className="rounded-lg border border-dashed border-border p-5 text-center">
            <p className="text-sm font-medium">No concerns split out yet</p>
            <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">
              Let the agent split this review into concerns and group the ones reviewers share, or
              select a sentence in the review on the right and add it yourself.
            </p>
            {readOnly ? null : (
              <Button
                size="sm"
                className="mt-3"
                onClick={() => void run(() => actions.askAgent({ kind: 'split' }))}
              >
                <Bot aria-hidden /> Split the reviews into concerns
              </Button>
            )}
          </div>
        ) : null}
        {rounds.map((round) => {
          const answers = reviewerAnswers(bundle, reviewer.id, round)
          const plan = planReviewerReplies(bundle, { round })
          const followUp = followUps.find((entry) => entry.round === round)
          const rowPredictions = (answer: RebuttalAnswer) => {
            const own = predictions.filter(
              (prediction) => answer.cluster && prediction.trigger.cluster === answer.cluster.id
            )
            return own.length
              ? {
                  count: own.length,
                  stale: own.some((prediction) => predictionIsStale(bundle, prediction))
                }
              : null
          }
          return (
            <div key={round} className="space-y-2.5">
              {round > 1 ? (
                <div className="space-y-1.5">
                  <h3 className="text-xs font-semibold">
                    Round {round}
                    {followUp ? (
                      <span className="ml-2 font-normal text-muted-foreground">
                        Received {new Date(followUp.receivedAt).toLocaleDateString()}
                      </span>
                    ) : null}
                  </h3>
                  {followUp ? (
                    <p className="scrollbar-sleek max-h-40 overflow-auto rounded-md bg-muted/50 p-2.5 text-xs leading-5 whitespace-pre-wrap">
                      {followUp.text}
                    </p>
                  ) : null}
                  {!answers.length && !readOnly ? (
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() =>
                        void run(() =>
                          actions.askAgent({ kind: 'split', reviewerId: reviewer.id, round })
                        )
                      }
                    >
                      <Bot aria-hidden /> Split this round into concerns
                    </Button>
                  ) : null}
                </div>
              ) : null}
              {answers.map((answer) => {
                const home =
                  answer.cluster && bundle.meta.assembly.shared === 'reviewer'
                    ? plan.home.get(answer.cluster.id)
                    : undefined
                return (
                  <ResearchRebuttalAnswerRow
                    key={answer.points[0]?.id ?? answer.label}
                    snapshot={snapshot}
                    reviewerId={reviewer.id}
                    answer={
                      round > 1 ? { ...answer, label: `Round ${round} ${answer.label}` } : answer
                    }
                    readOnly={readOnly}
                    stacked={stacked}
                    homeReviewer={
                      home && home.reviewer.id !== reviewer.id
                        ? {
                            id: home.reviewer.id,
                            name: reviewerDisplayName(home.reviewer),
                            answer: home.label
                          }
                        : null
                    }
                    actions={actions}
                    predicted={rowPredictions(answer)}
                    onShowPredictions={scrollToPredictions}
                  />
                )
              })}
            </div>
          )
        })}
        {followUps
          .filter((entry) => !rounds.includes(entry.round))
          .map((followUp) => (
            <div key={followUp.round} className="space-y-1.5">
              <h3 className="text-xs font-semibold">
                Round {followUp.round}
                <span className="ml-2 font-normal text-muted-foreground">
                  Received {new Date(followUp.receivedAt).toLocaleDateString()}
                </span>
              </h3>
              <p className="scrollbar-sleek max-h-40 overflow-auto rounded-md bg-muted/50 p-2.5 text-xs leading-5 whitespace-pre-wrap">
                {followUp.text}
              </p>
              {readOnly ? null : (
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() =>
                    void run(() =>
                      actions.askAgent({
                        kind: 'split',
                        reviewerId: reviewer.id,
                        round: followUp.round
                      })
                    )
                  }
                >
                  <Bot aria-hidden /> Split this round into concerns
                </Button>
              )}
            </div>
          ))}
        <div ref={predictionsSection} className="scroll-mt-2" />
        <ResearchRebuttalPredictions
          snapshot={snapshot}
          reviewerId={reviewer.id}
          readOnly={readOnly}
          actions={actions}
        />
      </div>
      <ResearchRebuttalFollowUpDialog
        reviewer={reviewer}
        open={followUpOpen}
        onOpenChange={setFollowUpOpen}
        onAdd={(text) => actions.addFollowUp(reviewer.id, text)}
      />
    </section>
  )
}
