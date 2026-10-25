import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  RESEARCH_FINDING_LAYERS,
  RESEARCH_FINDING_SEVERITIES,
  type ResearchFindingLayer,
  type ResearchFindingSeverity
} from '../../../../shared/research/research-quality-findings'
import type { ExperimentRecord } from '../../../../shared/research/research-records'
import { researchErrorText } from './research-error-text'
import { FINDING_LAYER_LABELS, FINDING_SEVERITY_LABELS } from './research-findings-format'
import { researchFindingsBridge } from './use-research-findings'

const CHECK = /^[a-z][a-z0-9.-]{0,63}$/
const MAX_RUNS = 6

export type ResearchFindingRunOption = { reference: string; name: string }

function isSeverity(value: string): value is ResearchFindingSeverity {
  return RESEARCH_FINDING_SEVERITIES.some((severity) => severity === value)
}

function isLayer(value: string): value is ResearchFindingLayer {
  return RESEARCH_FINDING_LAYERS.some((layer) => layer === value)
}

/** A finding the user records by hand; it needs no evidence because the user is the judge. */
export function ResearchFindingAddForm({
  experiment,
  slug,
  runs,
  onDone
}: {
  experiment: ExperimentRecord
  slug: string
  runs: ResearchFindingRunOption[]
  onDone: (recorded: boolean) => void
}): React.JSX.Element {
  const ids = useId()
  const [check, setCheck] = useState('note')
  const [severity, setSeverity] = useState<ResearchFindingSeverity>('warn')
  const [layer, setLayer] = useState<ResearchFindingLayer>('integrity')
  const [text, setText] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const checkValid = CHECK.test(check)
  const { add } = researchFindingsBridge()

  const submit = async (): Promise<void> => {
    if (!add || !checkValid || !text.trim()) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      await add({
        workspacePath: experiment.workspacePath,
        experiment: slug,
        check,
        severity,
        layer,
        text: text.trim(),
        runs: selected
      })
      onDone(true)
    } catch (cause) {
      setError(researchErrorText(cause))
      setBusy(false)
    }
  }

  return (
    <form
      aria-label="Add finding"
      className="space-y-3 rounded-md border border-border p-3"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor={`${ids}-check`}>Check</Label>
          <Input
            id={`${ids}-check`}
            density="compact"
            className="w-44"
            value={check}
            aria-invalid={!checkValid}
            onChange={(event) => setCheck(event.target.value)}
          />
        </div>
        <ToggleGroup
          type="single"
          variant="outline"
          size="xs"
          value={severity}
          onValueChange={(value) => isSeverity(value) && setSeverity(value)}
          aria-label="Severity"
        >
          {RESEARCH_FINDING_SEVERITIES.map((value) => (
            <ToggleGroupItem key={value} value={value}>
              {FINDING_SEVERITY_LABELS[value]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <ToggleGroup
          type="single"
          variant="outline"
          size="xs"
          value={layer}
          onValueChange={(value) => isLayer(value) && setLayer(value)}
          aria-label="Layer"
        >
          {RESEARCH_FINDING_LAYERS.map((value) => (
            <ToggleGroupItem key={value} value={value}>
              {FINDING_LAYER_LABELS[value]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${ids}-text`}>What you found</Label>
        <Textarea
          id={`${ids}-text`}
          autoFocus
          maxLength={2000}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </div>
      {runs.length ? (
        <div className="space-y-1">
          <p className="text-sm font-medium">Runs</p>
          <ToggleGroup
            type="multiple"
            variant="outline"
            size="xs"
            spacing={1}
            className="flex-wrap"
            value={selected}
            onValueChange={(value) => setSelected(value.slice(0, MAX_RUNS))}
            aria-label="Runs this finding is about"
          >
            {runs.map((run) => (
              <ToggleGroupItem key={run.reference} value={run.reference} title={run.reference}>
                {run.name}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-1">
        <Button type="button" size="xs" variant="ghost" onClick={() => onDone(false)}>
          Cancel
        </Button>
        <Button type="submit" size="xs" disabled={busy || !checkValid || !text.trim()}>
          Record finding
        </Button>
      </div>
    </form>
  )
}
