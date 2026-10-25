import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { ResearchRunRecord } from '../../../../shared/research/research-records'
import type { QualitativeSample } from './research-qualitative-outputs'
import { sampleMediaEntries } from './research-media-entries'
import { ResearchMediaGallery } from './research-media-players'
import { useResearchRecords } from './research-records-store'
import { researchErrorText } from './research-error-text'

/**
 * A sample's images, video and audio. Captions and alt text come from the row's labels and the
 * card title only, so a blind card names no Run; videos of one sample play in step across cards.
 */
function SampleMedia({
  run,
  sample,
  title
}: {
  run: ResearchRunRecord
  sample: QualitativeSample
  title: string
}): React.JSX.Element | null {
  const entries = sampleMediaEntries(run, sample, title)
  return entries.length ? <ResearchMediaGallery entries={entries} layout="stack" /> : null
}

export function OutputSource({ run }: { run: ResearchRunRecord }): React.JSX.Element {
  const [path, setPath] = useState(run.outputsPath ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => setPath(run.outputsPath ?? ''), [run.id, run.outputsPath])
  async function save(): Promise<void> {
    setSaving(true)
    setError(null)
    try {
      await useResearchRecords.getState().update((current) => ({
        ...current,
        runs: current.runs.map((entry) =>
          entry.id === run.id ? { ...entry, outputsPath: path.trim() || null } : entry
        )
      }))
    } catch (cause) {
      setError(`Could not save the output file. ${researchErrorText(cause)}`)
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground" htmlFor={`outputs-${run.id}`}>
        {run.name} output file
      </label>
      <div className="flex gap-2">
        <Input
          id={`outputs-${run.id}`}
          value={path}
          onChange={(event) => setPath(event.target.value)}
          placeholder="outputs.jsonl path"
          className="min-w-0 flex-1"
        />
        <Button
          size="sm"
          variant="outline"
          disabled={saving || path === (run.outputsPath ?? '')}
          onClick={() => void save()}
        >
          Save
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export function SampleCard({
  run,
  title,
  sample,
  footer
}: {
  run: ResearchRunRecord
  title: string
  sample: QualitativeSample | null
  footer?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="min-w-64 rounded-lg border border-border p-3">
      <h3 className="truncate text-sm font-medium" title={title}>
        {title}
      </h3>
      {sample ? (
        <div className="mt-3 space-y-3">
          {sample.prompt !== null ? (
            <div>
              <p className="text-xs font-medium text-muted-foreground">Prompt</p>
              <pre className="mt-1 whitespace-pre-wrap break-words text-xs">{sample.prompt}</pre>
            </div>
          ) : null}
          {sample.output !== null ? (
            <div>
              <p className="text-xs font-medium text-muted-foreground">Output</p>
              <pre className="mt-1 whitespace-pre-wrap break-words text-sm">{sample.output}</pre>
            </div>
          ) : null}
          <SampleMedia run={run} sample={sample} title={title} />
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">Not in this run.</p>
      )}
      {footer}
    </div>
  )
}
