import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ResearchRunRecord } from '../../../../shared/research/research-records'
import { readQualitativeOutputs, type QualitativeOutputs } from './research-qualitative-outputs'
import { researchErrorText } from './research-error-text'
import { OutputSource, SampleCard } from './research-sample-rating-output-views'
import { SampleJudgeButton } from './research-sample-rating-panel'
import { SampleRatingToolbar } from './research-sample-rating-toolbar'
import { PairwiseRatingControls, SingleRatingControls } from './research-sample-rating-controls'
import { useSampleRatingSession } from './research-sample-rating-session'

type OutputRead = { result: QualitativeOutputs | null; error: string | null }

/** Sample outputs of the compared Runs: side by side, rated one by one, or A/B against the baseline. */
export function ResearchQualitativeCompare({
  runs,
  baselineRunId
}: {
  runs: ResearchRunRecord[]
  /** The Experiment's baseline; A in A/B. */
  baselineRunId: string | null
}): React.JSX.Element {
  const [reads, setReads] = useState<Record<string, OutputRead>>({})
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let active = true
    setLoading(true)
    setReads({})
    void Promise.all(
      runs.map(async (run): Promise<[string, OutputRead]> => {
        try {
          return [run.id, { result: await readQualitativeOutputs(run), error: null }]
        } catch (cause) {
          return [run.id, { result: null, error: researchErrorText(cause) }]
        }
      })
    ).then((entries) => {
      if (active) {
        setReads(Object.fromEntries(entries))
        setLoading(false)
      }
    })
    return () => {
      active = false
    }
  }, [runs])
  const samplesByRun = useMemo(
    () =>
      new Map(
        runs.map((run) => [
          run.id,
          new Map((reads[run.id]?.result?.samples ?? []).map((sample) => [sample.sampleId, sample]))
        ])
      ),
    [runs, reads]
  )
  const session = useSampleRatingSession(runs, samplesByRun, baselineRunId)
  const { activeId, pair, scope, visibleIds, position } = session
  const sides = pair
    ? session.swapped
      ? [pair.candidate, pair.baseline]
      : [pair.baseline, pair.candidate]
    : []

  return (
    <section className="space-y-3" aria-label="Qualitative output comparison">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-2xs font-semibold uppercase tracking-widest text-muted-foreground">
          Sample outputs
        </h2>
        {scope ? <SampleJudgeButton onLaunch={session.judge} /> : null}
      </div>
      <SampleRatingToolbar session={session} />
      <details open={!loading && session.sampleIds.length === 0}>
        <summary className="w-fit cursor-pointer select-none rounded-sm text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Output files
        </summary>
        <p className="mt-2 text-xs text-muted-foreground">
          One .jsonl per run; lines share a sampleId and have an output, imagePath, or media.
        </p>
        <div className="mt-2 grid grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))] gap-3">
          {runs.map((run) => (
            <OutputSource key={run.id} run={run} />
          ))}
        </div>
      </details>
      {loading ? <p className="text-xs text-muted-foreground">Reading samples…</p> : null}
      {runs.map((run) =>
        reads[run.id]?.error ? (
          <p role="alert" key={run.id} className="text-xs text-destructive">
            {run.name}: {reads[run.id].error}
          </p>
        ) : null
      )}
      {runs.map((run) =>
        reads[run.id]?.result &&
        (reads[run.id].result?.errorRows || reads[run.id].result?.truncated) ? (
          <p key={run.id} className="text-xs text-muted-foreground">
            {run.name}: {reads[run.id].result?.errorRows} unreadable rows
            {reads[run.id].result?.truncated ? '; first 500 samples shown' : ''}
          </p>
        ) : null
      )}
      {activeId ? (
        <div
          tabIndex={0}
          onKeyDown={session.onKeyDown}
          aria-label="Sample being compared"
          className="space-y-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs font-medium" htmlFor="qualitative-sample-id">
              Sample ID
            </label>
            <select
              id="qualitative-sample-id"
              value={activeId}
              onChange={(event) => session.setSelectedId(event.target.value)}
              className="rounded-md border border-border bg-background px-2 py-1 text-sm"
            >
              {visibleIds.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
            {/* One pair of controls; the arrow keys they stand for are named on hover. */}
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Previous sample"
              aria-keyshortcuts={scope ? 'ArrowLeft' : undefined}
              title={scope ? 'Previous sample (←)' : 'Previous sample'}
              disabled={position <= 0}
              onClick={() => session.move(-1)}
            >
              <ChevronLeft />
            </Button>
            <span className="text-xs tabular-nums text-muted-foreground">
              {position + 1} of {visibleIds.length}
            </span>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Next sample"
              aria-keyshortcuts={scope ? 'ArrowRight' : undefined}
              title={scope ? 'Next sample (→)' : 'Next sample'}
              disabled={position >= visibleIds.length - 1}
              onClick={() => session.move(1)}
            >
              <ChevronRight />
            </Button>
          </div>
          {pair ? (
            <>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))] gap-3">
                {sides.map((entry, sideIndex) => (
                  <SampleCard
                    key={sideIndex}
                    run={entry.run}
                    title={
                      session.blind
                        ? `Output ${sideIndex + 1}`
                        : `${sideIndex === 0 ? 'A' : 'B'} · ${entry.run.name}`
                    }
                    sample={samplesByRun.get(entry.run.id)?.get(activeId) ?? null}
                  />
                ))}
              </div>
              <PairwiseRatingControls session={session} sampleId={activeId} />
            </>
          ) : (
            // Why wrap, not scroll: beside the agent chat a fixed card width clipped the second card.
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))] gap-3">
              {runs.map((run) => {
                const entry = session.ratable.find((item) => item.run.id === run.id)
                return (
                  <SampleCard
                    key={run.id}
                    run={run}
                    title={run.name}
                    sample={samplesByRun.get(run.id)?.get(activeId) ?? null}
                    footer={
                      session.activeMode !== 'single' ? null : !entry ? (
                        <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
                          Only local research/ catalog Runs can be rated.
                        </p>
                      ) : session.hasSample(entry.ref, activeId) ? (
                        <SingleRatingControls session={session} entry={entry} sampleId={activeId} />
                      ) : null
                    }
                  />
                )
              })}
            </div>
          )}
          {session.rateError ? (
            <p role="alert" className="text-xs text-destructive">
              {session.rateError}
            </p>
          ) : null}
        </div>
      ) : !loading ? (
        <p className="text-sm text-muted-foreground">
          {!session.sampleIds.length
            ? 'No sample outputs yet.'
            : pair && !session.scopedIds.length
              ? 'These two Runs share no sample IDs.'
              : 'No samples match this filter.'}
        </p>
      ) : null}
    </section>
  )
}
