import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import type { ResearchRunRecord } from '../../../../shared/research/research-records'
import type { BaselineChoice, ExperimentBaseline } from './research-experiment-workspace-baseline'
import { researchErrorText } from './research-error-text'

/**
 * The Experiment's one baseline. A catalog Experiment keeps it in the brief, so a change is
 * confirmed first: rule checks, summaries, and agent reviews move with it.
 */
export function ResearchExperimentWorkspaceBaseline({
  baseline,
  choices,
  runLabel,
  onChange
}: {
  baseline: ExperimentBaseline
  choices: BaselineChoice[]
  /** The Run's name, with its Experiment when it belongs to another one. */
  runLabel: (run: ResearchRunRecord) => string
  onChange: (choice: BaselineChoice) => Promise<void>
}): React.JSX.Element {
  const [confirming, setConfirming] = useState<BaselineChoice | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const current = baseline.run && choices.some((choice) => choice.run.id === baseline.run?.id)

  async function change(choice: BaselineChoice): Promise<void> {
    setSaving(true)
    setError(null)
    try {
      await onChange(choice)
      setConfirming(null)
    } catch (cause) {
      setError(researchErrorText(cause))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">Baseline</span>
      <Select
        value={current ? baseline.run?.id : ''}
        disabled={!choices.length || saving}
        onValueChange={(id) => {
          const choice = choices.find((entry) => entry.run.id === id)
          if (!choice || choice.run.id === baseline.run?.id) {
            return
          }
          if (choice.reference) {
            setError(null)
            setConfirming(choice)
          } else {
            void change(choice)
          }
        }}
      >
        <SelectTrigger size="sm" aria-label="Baseline" className="w-auto min-w-36">
          <SelectValue placeholder="None" />
        </SelectTrigger>
        <SelectContent>
          {choices.map((choice) => (
            <SelectItem key={choice.run.id} value={choice.run.id}>
              {runLabel(choice.run)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {baseline.reference && !baseline.run ? (
        <span className="text-xs text-muted-foreground">
          The brief names {baseline.reference}, which is not attached here.
        </span>
      ) : null}
      {error && !confirming ? (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      ) : null}
      <Dialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open && !saving) {
            setConfirming(null)
          }
        }}
      >
        {confirming ? (
          <DialogContent size="compact">
            <DialogHeader>
              <DialogTitle>Make {runLabel(confirming.run)} the baseline?</DialogTitle>
              <DialogDescription>
                This updates the Experiment brief, so rule checks, Run summaries, and agent reviews
                compare against it too.
              </DialogDescription>
            </DialogHeader>
            {error ? (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            ) : null}
            <DialogFooter>
              <Button variant="ghost" disabled={saving} onClick={() => setConfirming(null)}>
                Cancel
              </Button>
              <Button disabled={saving} onClick={() => void change(confirming)}>
                {saving ? 'Saving…' : 'Change baseline'}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  )
}
