import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  RESEARCH_EXPERIMENT_STATUSES,
  RESEARCH_PROPOSAL_POLICIES,
  RESEARCH_TRIAGE_POLICIES,
  type ResearchExperimentBrief,
  type ResearchExperimentBriefPatch
} from '../../../../shared/research/research-experiment-brief'
import { briefFormChanges, restoreBriefForm } from './research-experiment-brief-draft'
import {
  BRIEF_PROPOSAL_LABELS,
  BRIEF_STATUS_LABELS,
  BRIEF_TRIAGE_LABELS,
  briefForm,
  briefFormPatch,
  type BriefBaselineChoice,
  type ResearchExperimentBriefForm
} from './research-experiment-brief-form'
import { researchErrorText } from './research-error-text'
import {
  closeNotebookEditor,
  readNotebookDraft,
  writeNotebookDraft
} from './research-notebook-draft'

// Why a sentinel: Radix Select reserves the empty string for "no value".
const NO_BASELINE = '__none__'

type Form = ResearchExperimentBriefForm
type TextKey = {
  [Key in keyof Form]: string extends Form[Key] ? Key : never
}[keyof Form]

function Field({
  label,
  htmlFor,
  hint,
  className,
  children
}: {
  label: string
  htmlFor?: string
  /** What the field means, on hover, when the label alone is ambiguous. */
  hint?: string
  className?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className={cn('space-y-1', className)}>
      <Label htmlFor={htmlFor} title={hint}>
        {label}
      </Label>
      {children}
    </div>
  )
}

function ChoiceSelect<Value extends string>({
  label,
  value,
  choices,
  labels,
  onChange
}: {
  label: string
  value: Value
  choices: readonly Value[]
  labels: Record<Value, string>
  onChange: (value: Value) => void
}): React.JSX.Element {
  return (
    <Field label={label}>
      <Select
        value={value}
        onValueChange={(next) => {
          const chosen = choices.find((choice) => choice === next)
          if (chosen) {
            onChange(chosen)
          }
        }}
      >
        <SelectTrigger className="w-full" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {choices.map((choice) => (
            <SelectItem key={choice} value={choice}>
              {labels[choice]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}

/**
 * The notebook's inline plan form (the brief without its conclusion); saves only changed fields.
 * Every change is kept as the Experiment's plan draft until it is saved or discarded.
 */
export function ResearchExperimentBriefEditor({
  experimentId,
  brief,
  baselines,
  metricNames,
  onSave,
  onCancel
}: {
  experimentId: string
  brief: ResearchExperimentBrief | null
  baselines: BriefBaselineChoice[]
  metricNames: string[]
  onSave: (patch: ResearchExperimentBriefPatch) => Promise<void>
  onCancel: () => void
}): React.JSX.Element {
  const ids = useId()
  const [opened] = useState(() => briefForm(brief))
  const [form, setForm] = useState(
    () => restoreBriefForm(opened, readNotebookDraft('plan', experimentId)) ?? opened
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const changed = Object.keys(briefFormChanges(form, opened)).length > 0
  const set = <Key extends keyof Form>(key: Key, value: Form[Key]): void => {
    const next = { ...form, [key]: value }
    const changes = briefFormChanges(next, opened)
    setForm(next)
    writeNotebookDraft('plan', experimentId, Object.keys(changes).length ? { changes } : null)
  }
  const close = (): void =>
    closeNotebookEditor({ kind: 'plan', experimentId, changed, onClose: onCancel })
  const discard = (): void => {
    writeNotebookDraft('plan', experimentId, null)
    onCancel()
  }
  const textInput = (key: TextKey, placeholder: string) => ({
    id: `${ids}-${key}`,
    value: form[key],
    placeholder,
    maxLength: 200,
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => set(key, event.target.value)
  })
  const choices =
    form.baseline && !baselines.some((item) => item.reference === form.baseline)
      ? [...baselines, { reference: form.baseline, name: form.baseline }]
      : baselines

  async function save(): Promise<void> {
    const result = briefFormPatch(form, brief)
    if ('error' in result) {
      setError(result.error)
      return
    }
    if (!Object.keys(result.patch).length) {
      discard()
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave(result.patch)
      writeNotebookDraft('plan', experimentId, null)
    } catch (cause) {
      setError(researchErrorText(cause))
      setSaving(false)
    }
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
      onKeyDown={(event) => {
        // Why defaultPrevented: Esc that closed an open select menu must not also close the form.
        if (event.key === 'Escape' && !event.defaultPrevented && !saving) {
          event.preventDefault()
          event.stopPropagation()
          close()
        }
      }}
    >
      <Field label="Question" htmlFor={`${ids}-question`}>
        <Textarea
          id={`${ids}-question`}
          autoFocus
          value={form.question}
          onChange={(event) => set('question', event.target.value)}
          placeholder="Does LoRA r16 match full fine-tuning on SST-2?"
          className="min-h-12"
          maxLength={4000}
        />
      </Field>
      <Field label="Hypothesis" htmlFor={`${ids}-hypothesis`}>
        <Textarea
          id={`${ids}-hypothesis`}
          value={form.hypothesis}
          onChange={(event) => set('hypothesis', event.target.value)}
          placeholder="r16 stays within 0.5 pt of full fine-tuning"
          className="min-h-12"
          maxLength={4000}
        />
      </Field>
      <div className="grid grid-cols-[minmax(0,1fr)_7rem_10rem] gap-3">
        <Field label="Primary metric" htmlFor={`${ids}-metricName`}>
          <Input {...textInput('metricName', 'acc')} list={`${ids}-metrics`} />
          <datalist id={`${ids}-metrics`}>
            {metricNames.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </Field>
        <Field
          label="Metric split"
          htmlFor={`${ids}-metricSplit`}
          hint="The split the metric is logged under, such as val in val/acc"
        >
          <Input {...textInput('metricSplit', 'val')} />
        </Field>
        <ChoiceSelect
          label="Goal"
          value={form.metricDirection}
          choices={['maximize', 'minimize'] as const}
          labels={{ maximize: 'Higher is better', minimize: 'Lower is better' }}
          onChange={(value) => set('metricDirection', value)}
        />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_10rem] gap-3">
        <Field label="Baseline Run">
          <Select
            value={form.baseline || NO_BASELINE}
            onValueChange={(value) => set('baseline', value === NO_BASELINE ? '' : value)}
          >
            <SelectTrigger className="w-full" aria-label="Baseline Run">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_BASELINE}>None</SelectItem>
              {choices.map((item) => (
                <SelectItem key={item.reference} value={item.reference}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <ChoiceSelect
          label="Status"
          value={form.status}
          choices={RESEARCH_EXPERIMENT_STATUSES}
          labels={BRIEF_STATUS_LABELS}
          onChange={(value) => set('status', value)}
        />
      </div>
      <div className="grid grid-cols-4 gap-3">
        <Field label="Dataset" htmlFor={`${ids}-datasetId`}>
          <Input {...textInput('datasetId', 'sst2')} />
        </Field>
        <Field label="Dataset version" htmlFor={`${ids}-datasetRevision`}>
          <Input {...textInput('datasetRevision', 'Optional')} />
        </Field>
        <Field
          label="Dataset split"
          htmlFor={`${ids}-evaluationSplit`}
          hint="The split of the evaluation dataset, recorded with each Run"
        >
          <Input {...textInput('evaluationSplit', 'Optional')} />
        </Field>
        <Field label="Evaluator version" htmlFor={`${ids}-evaluatorRevision`}>
          <Input {...textInput('evaluatorRevision', 'Optional')} />
        </Field>
      </div>
      <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3">
        <Field label="Min seeds" htmlFor={`${ids}-minSeeds`}>
          <Input {...textInput('minSeeds', 'None')} type="number" min={1} max={20} />
        </Field>
        <Field label="Rubric file" htmlFor={`${ids}-rubric`}>
          <Input {...textInput('rubric', '.aster/experiments/…/rubric.md')} maxLength={4096} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <ChoiceSelect
          label="Agent triage"
          value={form.triage}
          choices={RESEARCH_TRIAGE_POLICIES}
          labels={BRIEF_TRIAGE_LABELS}
          onChange={(value) => set('triage', value)}
        />
        <ChoiceSelect
          label="Agent rerun proposals"
          value={form.proposals}
          choices={RESEARCH_PROPOSAL_POLICIES}
          labels={BRIEF_PROPOSAL_LABELS}
          onChange={(value) => set('proposals', value)}
        />
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex items-center justify-end gap-2">
        {changed ? (
          <span className="mr-auto flex items-center gap-1 text-xs text-muted-foreground">
            Draft kept until you save
            <Button type="button" size="xs" variant="ghost" onClick={discard} disabled={saving}>
              Discard changes
            </Button>
          </span>
        ) : null}
        <Button type="button" size="sm" variant="ghost" onClick={close} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? 'Saving…' : 'Save plan'}
        </Button>
      </div>
    </form>
  )
}
