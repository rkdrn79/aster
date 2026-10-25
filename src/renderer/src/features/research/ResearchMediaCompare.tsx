import { useId, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import type { ResearchRunRecord } from '../../../../shared/research/research-records'
import type { ResearchRunMediaItem } from '../../../../shared/research/research-run-media'
import { runMediaEntry } from './research-media-entries'
import {
  alignedMediaRows,
  chosenMediaCompareKey,
  mediaCompareKeyForLabel,
  mediaCompareLabels,
  type MediaCompareKey
} from './research-media-groups'
import { useResearchRunMedia } from './research-media-index'
import {
  ResearchMediaLightbox,
  ResearchMediaTile,
  type ResearchMediaEntry
} from './research-media-players'
import { ResearchMediaStepPicker } from './research-media-step-picker'

const ROWS_PER_PAGE = 6

type MediaColumn = { run: ResearchRunRecord; items: readonly ResearchRunMediaItem[] }

function runNames(runs: readonly ResearchRunRecord[]): string {
  return runs.map((run) => run.name).join(', ')
}

/** The same step and label of media side by side across Runs, the baseline first. */
export function ResearchMediaCompare({
  runs,
  baselineRunId
}: {
  runs: ResearchRunRecord[]
  baselineRunId: string | null
}): React.JSX.Element | null {
  const ordered = useMemo(() => {
    const baseline = runs.find((run) => run.id === baselineRunId)
    return baseline ? [baseline, ...runs.filter((run) => run !== baseline)] : runs
  }, [runs, baselineRunId])
  const reads = useResearchRunMedia(ordered)
  const [chosen, setChosen] = useState<MediaCompareKey | null>(null)
  const [rowLimit, setRowLimit] = useState(ROWS_PER_PAGE)
  const [lightbox, setLightbox] = useState<{ row: number; index: number } | null>(null)
  const syncScope = useId()

  const columns = useMemo(
    () =>
      ordered.flatMap((run): MediaColumn[] => {
        const read = reads.get(run.id)
        return read?.status === 'ready' && read.items.length ? [{ run, items: read.items }] : []
      }),
    [ordered, reads]
  )
  const labels = useMemo(
    () => mediaCompareLabels(columns.map(({ run, items }) => ({ runId: run.id, items }))),
    [columns]
  )
  const key = chosenMediaCompareKey(labels, chosen)
  const rowEntries = key
    ? alignedMediaRows(
        columns.map(({ run, items }) => ({ runId: run.id, items })),
        key
      ).map((row, rowIndex) =>
        columns.map(({ run }, column) => {
          const item = row[column]
          return item
            ? runMediaEntry(run, item, {
                runName: true,
                syncKey: `${syncScope}${JSON.stringify([key.label, key.step, rowIndex])}`
              })
            : null
        })
      )
    : []

  const failed = ordered.filter((run) => reads.get(run.id)?.status === 'error')
  if (!columns.length && !failed.length) {
    return null
  }
  const choose = (next: MediaCompareKey): void => {
    setChosen(next)
    setRowLimit(ROWS_PER_PAGE)
    setLightbox(null)
  }
  const unindexed = ordered.filter((run) => reads.get(run.id)?.status === 'unindexed')
  const empty = ordered.filter((run) => {
    const read = reads.get(run.id)
    return read?.status === 'ready' && read.items.length === 0
  })
  const labelIndex = labels.findIndex((entry) => entry.label === key?.label)
  const current = labels[labelIndex]
  const lightboxImages = lightbox
    ? (rowEntries[lightbox.row] ?? []).filter(
        (entry): entry is ResearchMediaEntry => entry?.kind === 'image'
      )
    : []

  return (
    <section className="space-y-3" aria-label="Media comparison">
      <h2 className="text-2xs font-semibold uppercase tracking-widest text-muted-foreground">
        Media
      </h2>
      {failed.map((run) => {
        const read = reads.get(run.id)
        return read?.status === 'error' ? (
          <p key={run.id} className="text-xs text-destructive">
            {run.name}: media unavailable. {read.error}
          </p>
        ) : null
      })}
      {current && key ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {labels.length > 1 ? (
            <Select
              value={String(labelIndex)}
              onValueChange={(value) => {
                const entry = labels[Number(value)]
                if (entry) {
                  choose(mediaCompareKeyForLabel(entry))
                }
              }}
            >
              <SelectTrigger size="sm" aria-label="Media label" className="min-w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {labels.map((entry, index) => (
                  <SelectItem key={entry.label ?? '\u0000'} value={String(index)}>
                    {entry.label ?? 'Unlabeled'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="text-sm font-medium">{current.label ?? 'Unlabeled'}</span>
          )}
          <ResearchMediaStepPicker
            steps={current.steps}
            value={key.step}
            label={`${current.label ?? 'Unlabeled'} step`}
            onChange={(step) => choose({ label: key.label, step })}
          />
        </div>
      ) : null}
      {columns.length > 1 && !labels.some((entry) => entry.sharedSteps.length) ? (
        <p className="text-xs text-muted-foreground">
          These Runs share no media label and step, so each column shows what its Run has here.
        </p>
      ) : current && key && columns.length > 1 && !current.sharedSteps.includes(key.step) ? (
        <p className="text-xs text-muted-foreground">Not every Run has media at this step.</p>
      ) : null}
      {columns.length ? (
        <div className="scrollbar-sleek overflow-x-auto pb-2">
          <div className="min-w-fit space-y-3">
            <div className="grid grid-flow-col auto-cols-[minmax(14rem,1fr)] gap-3">
              {columns.map(({ run }) => (
                <div key={run.id} className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-medium" title={run.name}>
                    {run.name}
                  </span>
                  {run.id === baselineRunId ? <Badge variant="outline">Baseline</Badge> : null}
                </div>
              ))}
            </div>
            {rowEntries.slice(0, rowLimit).map((row, rowIndex) => (
              <div
                key={row.map((entry) => entry?.key ?? '').join('\u0001')}
                className="grid grid-flow-col auto-cols-[minmax(14rem,1fr)] gap-3"
              >
                {columns.map(({ run }, column) => {
                  const entry = row[column]
                  return entry ? (
                    <ResearchMediaTile
                      key={entry.key}
                      entry={entry}
                      layout="stack"
                      onOpenImage={() => {
                        const images = row.filter((cell) => cell?.kind === 'image')
                        setLightbox({ row: rowIndex, index: images.indexOf(entry) })
                      }}
                    />
                  ) : (
                    <p
                      key={`${run.id}\u0000empty`}
                      className="flex min-h-16 items-center justify-center rounded-md border border-dashed border-border p-2 text-xs text-muted-foreground"
                    >
                      Nothing here at this step
                    </p>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {rowEntries.length > rowLimit ? (
        <Button
          size="xs"
          variant="ghost"
          onClick={() => setRowLimit((limit) => limit + ROWS_PER_PAGE)}
        >
          {rowEntries.length - rowLimit} more
        </Button>
      ) : null}
      {[
        unindexed.length
          ? `Not compared: ${runNames(unindexed)}. Media is indexed for local research/ catalog Runs.`
          : null,
        empty.length ? `No media recorded: ${runNames(empty)}.` : null
      ].map((note) =>
        note ? (
          <p key={note} className="text-xs text-muted-foreground">
            {note}
          </p>
        ) : null
      )}
      {lightbox ? (
        <ResearchMediaLightbox
          images={lightboxImages}
          index={lightbox.index}
          onIndexChange={(index) => setLightbox({ row: lightbox.row, index })}
          onClose={() => setLightbox(null)}
        />
      ) : null}
    </section>
  )
}
