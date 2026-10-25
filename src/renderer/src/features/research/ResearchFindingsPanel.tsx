import { useCallback, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  RESEARCH_FINDING_LAYERS,
  type ResearchFinding,
  type ResearchFindingLayer
} from '../../../../shared/research/research-quality-findings'
import type {
  ExperimentRecord,
  ResearchRunRecord
} from '../../../../shared/research/research-records'
import { ResearchFindingAddForm, type ResearchFindingRunOption } from './research-findings-add-form'
import { FINDING_LAYER_LABELS, sortFindings } from './research-findings-format'
import { ResearchFindingRow } from './research-findings-row'
import { catalogRunReference, harnessExperimentSlug } from './use-research-harness-experiment'
import type { ResearchFindingsState } from './use-research-findings'

type FindingsFilter = 'open' | 'all'

function FindingGroup({
  layer,
  findings,
  showInfo,
  onToggleInfo,
  renderRow
}: {
  layer: ResearchFindingLayer
  findings: ResearchFinding[]
  showInfo: boolean
  onToggleInfo: () => void
  renderRow: (finding: ResearchFinding) => React.ReactNode
}): React.JSX.Element {
  // Why: info findings are reproducibility notes; collapsing them keeps fail/warn readable.
  const info = findings.filter((finding) => finding.severity === 'info')
  const shown = showInfo ? findings : findings.filter((finding) => finding.severity !== 'info')
  return (
    <div className="space-y-1">
      <h3 className="flex items-center gap-2 text-xs font-medium">
        {FINDING_LAYER_LABELS[layer]}
        <span className="font-normal text-muted-foreground">{findings.length}</span>
      </h3>
      {shown.length ? <ul className="space-y-1">{shown.map(renderRow)}</ul> : null}
      {info.length ? (
        <Button size="xs" variant="ghost" onClick={onToggleInfo}>
          {showInfo ? 'Hide info findings' : `Show ${info.length} info`}
        </Button>
      ) : null}
    </div>
  )
}

/**
 * Every rule, agent, and user finding of one Experiment, behind the notebook's "All findings";
 * only the user accepts or dismisses them.
 */
export function ResearchFindingsPanel({
  experiment,
  runs,
  state
}: {
  experiment: ExperimentRecord
  runs: ResearchRunRecord[]
  state: ResearchFindingsState
}): React.JSX.Element {
  const [filter, setFilter] = useState<FindingsFilter>('open')
  const [adding, setAdding] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const slug = harnessExperimentSlug(experiment)
  const runOptions = useMemo(
    () =>
      runs.flatMap((run): ResearchFindingRunOption[] => {
        const reference = catalogRunReference(run)
        return reference ? [{ reference, name: run.name }] : []
      }),
    [runs]
  )
  const runName = useCallback(
    (reference: string) =>
      runOptions.find((option) => option.reference === reference)?.name ?? reference,
    [runOptions]
  )
  const open = state.findings.filter((finding) => finding.status === 'open')
  const shown = sortFindings(filter === 'open' ? open : state.findings)
  const { refresh } = state

  return (
    <section aria-label="Findings" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h3 className="text-xs font-medium">All findings</h3>
        {state.available && slug ? (
          <div className="flex items-center gap-2">
            <ToggleGroup
              type="single"
              variant="outline"
              size="xs"
              value={filter}
              onValueChange={(value) => value && setFilter(value === 'all' ? 'all' : 'open')}
              aria-label="Findings shown"
            >
              <ToggleGroupItem value="open">Open</ToggleGroupItem>
              <ToggleGroupItem value="all">All</ToggleGroupItem>
            </ToggleGroup>
            <Button
              size="xs"
              variant="ghost"
              aria-expanded={adding}
              onClick={() => setAdding((value) => !value)}
            >
              <Plus aria-hidden />
              Add finding
            </Button>
          </div>
        ) : null}
      </div>
      {!state.available || !slug ? (
        <p className="text-xs text-muted-foreground">
          Available for local research/ catalog projects.
        </p>
      ) : (
        <>
          {state.error ? (
            <p role="alert" className="text-xs text-destructive">
              {state.error}
            </p>
          ) : null}
          {adding ? (
            <ResearchFindingAddForm
              experiment={experiment}
              slug={slug}
              runs={runOptions}
              onDone={(recorded) => {
                setAdding(false)
                if (recorded) {
                  void refresh()
                }
              }}
            />
          ) : null}
          {state.loading ? (
            <p className="text-xs text-muted-foreground">Reading findings…</p>
          ) : shown.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {filter === 'open' && state.findings.length
                ? `No open findings. ${state.findings.length} closed.`
                : filter === 'open'
                  ? 'No open findings.'
                  : 'No findings yet.'}
            </p>
          ) : (
            RESEARCH_FINDING_LAYERS.map((layer) => {
              const findings = shown.filter((finding) => finding.layer === layer)
              return findings.length ? (
                <FindingGroup
                  key={layer}
                  layer={layer}
                  findings={findings}
                  showInfo={showInfo}
                  onToggleInfo={() => setShowInfo((value) => !value)}
                  renderRow={(finding) => (
                    <ResearchFindingRow
                      key={finding.id}
                      experiment={experiment}
                      slug={slug}
                      finding={finding}
                      runName={runName}
                      onChanged={refresh}
                    />
                  )}
                />
              ) : null
            })
          )}
        </>
      )}
    </section>
  )
}
