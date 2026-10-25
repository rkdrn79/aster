import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { ResearchRunRecord } from '../../../../shared/research/research-records'
import {
  RESEARCH_MEDIA_KINDS,
  type ResearchMediaKind
} from '../../../../shared/research/research-run-media'
import { runMediaEntry } from './research-media-entries'
import {
  groupMediaByLabel,
  latestMediaStep,
  mediaKindCounts,
  mediaStepText,
  type MediaLabelGroup,
  type MediaStep
} from './research-media-groups'
import { useResearchRunMedia } from './research-media-index'
import { ResearchMediaGallery } from './research-media-players'
import { ResearchMediaStepPicker } from './research-media-step-picker'

const LABELS_PER_PAGE = 6
const FILES_PER_PAGE = 24
const KIND_FILTER_NAMES: Record<ResearchMediaKind, string> = {
  image: 'Images',
  video: 'Videos',
  audio: 'Audio'
}

function fileCount(count: number): string {
  return `${count} ${count === 1 ? 'file' : 'files'}`
}

function LabelGroup({
  run,
  group
}: {
  run: ResearchRunRecord
  group: MediaLabelGroup
}): React.JSX.Element {
  const [chosenStep, setChosenStep] = useState<MediaStep | undefined>(undefined)
  const [limit, setLimit] = useState(FILES_PER_PAGE)
  // Why not stored: until the user picks one, the newest step a running Run writes is shown.
  const step =
    chosenStep !== undefined && group.itemsByStep.has(chosenStep)
      ? chosenStep
      : (latestMediaStep(group.steps) ?? group.steps[0] ?? null)
  const items = group.itemsByStep.get(step) ?? []
  const name = group.label ?? 'Unlabeled'
  return (
    <div className="space-y-2">
      <p className="flex flex-wrap items-baseline gap-x-2 text-xs">
        <span className="font-medium">{name}</span>
        <span className="text-muted-foreground">
          {group.steps.length > 1
            ? `${group.steps.length} steps · ${fileCount(group.count)}`
            : [step === null ? null : mediaStepText(step), fileCount(items.length)]
                .filter(Boolean)
                .join(' · ')}
        </span>
      </p>
      <ResearchMediaStepPicker
        steps={group.steps}
        value={step}
        label={`${name} step`}
        onChange={(next) => {
          setChosenStep(next)
          setLimit(FILES_PER_PAGE)
        }}
      />
      <ResearchMediaGallery
        layout="grid"
        entries={items.slice(0, limit).map((item) => runMediaEntry(run, item))}
      />
      {items.length > limit ? (
        <Button
          size="xs"
          variant="ghost"
          onClick={() => setLimit((current) => current + FILES_PER_PAGE)}
        >
          {items.length - limit} more
        </Button>
      ) : null}
    </div>
  )
}

/** The Run's images, videos, and audio grouped by step and label. */
export function ResearchRunMediaSection({
  run
}: {
  run: ResearchRunRecord
}): React.JSX.Element | null {
  const runs = useMemo(() => [run], [run])
  const read = useResearchRunMedia(runs).get(run.id)
  const [kindFilter, setKindFilter] = useState<ResearchMediaKind | null>(null)
  const [labelLimit, setLabelLimit] = useState(LABELS_PER_PAGE)
  const items = useMemo(() => (read?.status === 'ready' ? read.items : []), [read])
  const counts = mediaKindCounts(items)
  const activeKind = kindFilter && counts[kindFilter] > 0 ? kindFilter : null
  const groups = useMemo(
    () => groupMediaByLabel(activeKind ? items.filter((item) => item.kind === activeKind) : items),
    [activeKind, items]
  )
  if (read?.status === 'error') {
    return (
      <section aria-label="Run media" className="space-y-1">
        <h3 className="text-sm font-medium">Media</h3>
        <p className="text-xs text-destructive">Media unavailable: {read.error}</p>
      </section>
    )
  }
  if (read?.status !== 'ready' || items.length === 0) {
    return null
  }
  const kinds = RESEARCH_MEDIA_KINDS.filter((kind) => counts[kind] > 0)
  const filters: { kind: ResearchMediaKind | null; text: string }[] = [
    { kind: null, text: `All ${items.length}` },
    ...kinds.map((kind) => ({ kind, text: `${KIND_FILTER_NAMES[kind]} ${counts[kind]}` }))
  ]
  return (
    <section aria-label="Run media" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">
          Media{' '}
          <span className="font-normal text-muted-foreground">· {fileCount(items.length)}</span>
        </h3>
        {kinds.length > 1 ? (
          <div role="group" aria-label="Media kind" className="flex flex-wrap gap-1">
            {filters.map((filter) => (
              <Button
                key={filter.kind ?? 'all'}
                size="xs"
                variant={activeKind === filter.kind ? 'secondary' : 'ghost'}
                aria-pressed={activeKind === filter.kind}
                onClick={() => {
                  setKindFilter(filter.kind)
                  setLabelLimit(LABELS_PER_PAGE)
                }}
              >
                {filter.text}
              </Button>
            ))}
          </div>
        ) : null}
      </div>
      {groups.slice(0, labelLimit).map((group) => (
        <LabelGroup key={group.label ?? '\u0000'} run={run} group={group} />
      ))}
      {groups.length > labelLimit ? (
        <Button
          size="xs"
          variant="ghost"
          onClick={() => setLabelLimit((current) => current + LABELS_PER_PAGE)}
        >
          {groups.length - labelLimit} more labels
        </Button>
      ) : null}
      {read.truncated ? (
        <p className="text-xs text-muted-foreground">
          The media index lists only the first {items.length} files of this Run.
        </p>
      ) : null}
    </section>
  )
}
