import type {
  ResearchPairwiseVerdict,
  ResearchSingleVerdict
} from '../../../../shared/research/research-sample-ratings'
import { choiceForVerdict, type ABChoice } from './research-sample-rating-blind'
import { isPairwiseVerdict, isSingleVerdict, sampleJudgments } from './research-sample-rating-index'
import { AgentJudgmentLine, RatingTagsField, VerdictButtons } from './research-sample-rating-panel'
import type { RatableRun } from './research-sample-rating-runs'
import { ratingUnitKey, type SampleRatingSession } from './research-sample-rating-session'

const SINGLE_OPTIONS: { value: ResearchSingleVerdict; label: string }[] = [
  { value: 'good', label: 'Good' },
  { value: 'bad', label: 'Bad' },
  { value: 'unsure', label: 'Unsure' }
]
const PAIRWISE_LABELS: Record<ResearchPairwiseVerdict, string> = {
  a: 'A better',
  b: 'B better',
  tie: 'Tie'
}

/** Good / bad / unsure and tags for one Run's output of the sample. */
export function SingleRatingControls({
  session,
  entry,
  sampleId
}: {
  session: SampleRatingSession
  entry: RatableRun
  sampleId: string
}): React.JSX.Element {
  const judgments = sampleJudgments(session.index, sampleId, entry.ref, null)
  const unitKey = ratingUnitKey(sampleId, entry.ref, null)
  const current =
    judgments.user && isSingleVerdict(judgments.user.verdict) ? judgments.user.verdict : null
  return (
    <div className="mt-3 space-y-2 border-t border-border pt-3">
      <VerdictButtons
        label={`Rate ${entry.run.name}`}
        options={SINGLE_OPTIONS}
        current={current}
        disabled={session.saving}
        onChoose={(verdict) => session.rateSingle(entry, verdict)}
      />
      <RatingTagsField
        id={`rating-tags-${entry.run.id}`}
        value={session.tagsValue(unitKey, judgments.user?.tags ?? [])}
        onChange={(value) => session.setTagsValue(unitKey, value)}
      />
      <AgentJudgmentLine
        agent={judgments.agent}
        user={judgments.user}
        verdictLabel={(verdict) => verdict}
      />
    </div>
  )
}

/** A / B / tie for the shown pair; in blind mode the choices name sides, not Runs. */
export function PairwiseRatingControls({
  session,
  sampleId
}: {
  session: SampleRatingSession
  sampleId: string
}): React.JSX.Element | null {
  const { pair, blind, swapped, pairJudgments, userPairVerdict } = session
  if (!pair) {
    return null
  }
  const unitKey = ratingUnitKey(sampleId, pair.baseline.ref, pair.candidate.ref)
  const options: { value: ABChoice; label: string; shortcut: string }[] = [
    { value: 'left', label: blind ? 'Output 1 better' : 'A better', shortcut: '1' },
    { value: 'right', label: blind ? 'Output 2 better' : 'B better', shortcut: '2' },
    { value: 'tie', label: 'Tie', shortcut: '3' }
  ]
  return (
    <div className="space-y-2">
      <VerdictButtons
        label="Which output is better?"
        options={options}
        current={userPairVerdict ? choiceForVerdict(userPairVerdict, swapped) : null}
        disabled={session.saving}
        onChoose={session.choose}
      />
      <RatingTagsField
        id="rating-tags-ab"
        value={session.tagsValue(unitKey, pairJudgments.user?.tags ?? [])}
        onChange={(value) => session.setTagsValue(unitKey, value)}
      />
      {/* Why: a visible agent verdict would anchor a blind judgment. */}
      {blind ? null : (
        <AgentJudgmentLine
          agent={pairJudgments.agent}
          user={pairJudgments.user}
          verdictLabel={(verdict) =>
            isPairwiseVerdict(verdict) ? PAIRWISE_LABELS[verdict] : verdict
          }
        />
      )}
    </div>
  )
}
