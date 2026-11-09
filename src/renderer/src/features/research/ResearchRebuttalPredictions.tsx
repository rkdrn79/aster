import { useState } from 'react'
import { AlertTriangle, ListPlus, Lightbulb, X, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  predictionIsStale,
  type RebuttalPrediction
} from '../../../../research-harness/research-rebuttal-records.mjs'
import type { RebuttalSnapshot } from './research-rebuttal-snapshot'
import { openPredictions } from './research-rebuttal-view'
import type { RebuttalActions } from './use-research-rebuttal-actions'

const LIKELIHOOD_LABELS: Record<RebuttalPrediction['likelihood'], string> = {
  high: 'Likely',
  medium: 'Possible',
  low: 'Unlikely'
}

function PredictionCard({
  prediction,
  snapshot,
  readOnly,
  actions
}: {
  prediction: RebuttalPrediction
  snapshot: RebuttalSnapshot
  readOnly: boolean
  actions: RebuttalActions
}): React.JSX.Element {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const stale = predictionIsStale(snapshot.bundle, prediction)
  const cluster = prediction.trigger.cluster

  async function run(task: () => Promise<string | null>): Promise<void> {
    setBusy(true)
    setError(await task())
    setBusy(false)
  }

  return (
    <article
      aria-label={`Predicted concern ${prediction.id}`}
      className={cn(
        'space-y-1.5 rounded-md border border-border bg-background p-2.5',
        stale && 'border-dashed'
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs text-muted-foreground">
        <span
          className={cn(
            'rounded-sm px-1 py-px font-medium',
            prediction.likelihood === 'high'
              ? 'bg-foreground text-background'
              : 'bg-muted text-foreground'
          )}
        >
          {LIKELIHOOD_LABELS[prediction.likelihood]}
        </span>
        {prediction.trigger.point ? (
          <span className="font-mono">{prediction.trigger.point}</span>
        ) : null}
        {cluster ? <span className="font-mono">{cluster}</span> : null}
        {stale ? (
          <span className="inline-flex items-center gap-1 text-status-warning">
            <AlertTriangle className="size-3" aria-hidden /> Reply changed since this was predicted
          </span>
        ) : null}
        {prediction.status === 'handed-off' ? <span>Sent to the Rebuttal agent</span> : null}
      </div>
      <p className="text-sm leading-5">{prediction.concern}</p>
      <p className="text-xs leading-5 text-muted-foreground">
        <span className="font-medium text-foreground">Why. </span>
        {prediction.why}
        {prediction.trigger.quote ? ` “${prediction.trigger.quote}”` : ''}
      </p>
      <p className="text-xs leading-5 text-muted-foreground">
        <span className="font-medium text-foreground">Pre-empt. </span>
        {prediction.preempt}
      </p>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      {readOnly ? null : (
        <div className="flex flex-wrap items-center gap-1 pt-0.5">
          <Button
            size="xs"
            variant="ghost"
            disabled={busy}
            onClick={() => void run(() => actions.dismissPrediction(prediction.id))}
          >
            <X aria-hidden /> Dismiss
          </Button>
          <Button
            size="xs"
            variant="ghost"
            disabled={busy}
            onClick={() => void run(() => actions.convertPrediction(prediction.id))}
          >
            <ListPlus aria-hidden /> Address as a concern
          </Button>
          <Button
            size="xs"
            variant="outline"
            disabled={busy || !cluster}
            title={
              cluster ? undefined : 'This one is not tied to a reply; address it as a concern.'
            }
            onClick={() => void run(() => actions.strengthen(prediction.id))}
          >
            <Zap aria-hidden /> Strengthen the reply
          </Button>
        </div>
      )}
    </article>
  )
}

type Props = {
  snapshot: RebuttalSnapshot
  reviewerId: string
  readOnly: boolean
  actions: RebuttalActions
}

/** What the simulated reviewer expects to raise next, with the person's decision on each. */
export function ResearchRebuttalPredictions({
  snapshot,
  reviewerId,
  readOnly,
  actions
}: Props): React.JSX.Element | null {
  const predictions = openPredictions(snapshot, reviewerId)
  const dismissed = snapshot.predictions.filter(
    (entry) => entry.reviewer === reviewerId && entry.status === 'dismissed'
  ).length
  if (!predictions.length && !dismissed) {
    return null
  }
  return (
    <section aria-label={`Predicted next concerns of ${reviewerId}`} className="space-y-2">
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <Lightbulb className="size-3.5 text-muted-foreground" aria-hidden />
        <h3 className="font-medium">What {reviewerId} may raise next</h3>
        <span className="text-muted-foreground">
          Simulated from {reviewerId}&apos;s review, not the real reviewer.
        </span>
        {dismissed ? (
          <span className="ml-auto text-2xs text-muted-foreground">{dismissed} dismissed</span>
        ) : null}
      </header>
      {predictions.map((prediction) => (
        <PredictionCard
          key={prediction.id}
          prediction={prediction}
          snapshot={snapshot}
          readOnly={readOnly}
          actions={actions}
        />
      ))}
    </section>
  )
}
