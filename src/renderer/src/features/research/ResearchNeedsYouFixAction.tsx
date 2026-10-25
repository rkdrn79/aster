import { useId, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import type { ResearchFinding } from '../../../../shared/research/research-quality-findings'
import { briefBaselineChoices } from './research-experiment-brief-form'
import type { ExperimentWorkspace } from './research-experiment-workspace-state'
import { researchErrorText } from './research-error-text'
import { findingFix } from './research-finding-titles'
import { openResearchView } from './research-navigation'
import { researchHarnessBridge } from './use-research-harness-experiment'

/** Records a Run whose launcher exited as failed, through the harness's `run finish`. */
function MarkFailedAction({
  workspace,
  reference
}: {
  workspace: ExperimentWorkspace
  reference: string
}): React.JSX.Element | null {
  const [busy, setBusy] = useState(false)
  const runFinish = researchHarnessBridge().runFinish
  if (!workspace.scope || !runFinish) {
    return null
  }
  const { workspacePath } = workspace.scope
  const finish = runFinish
  async function markFailed(): Promise<void> {
    setBusy(true)
    try {
      await finish({
        workspacePath,
        run: reference,
        status: 'failed',
        note: 'Marked failed in Aster after its launcher exited'
      })
      await workspace.refreshRuns()
    } catch (cause) {
      toast.error(`Couldn't mark it failed. ${researchErrorText(cause)}`)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Button size="xs" variant="outline" disabled={busy} onClick={() => void markFailed()}>
      {busy ? 'Marking…' : 'Mark failed'}
    </Button>
  )
}

/** The brief's baseline picker, opened from the "No baseline" item. */
function ChooseBaselineAction({
  workspace
}: {
  workspace: ExperimentWorkspace
}): React.JSX.Element {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const { experiment, document, brief } = workspace
  const choices = useMemo(
    () =>
      experiment && document
        ? briefBaselineChoices(experiment, document.experiments, document.runs)
        : [],
    [document, experiment]
  )
  async function choose(reference: string): Promise<void> {
    setSaving(true)
    try {
      await brief.update({ baseline: reference })
      workspace.afterBriefSaved({ baseline: reference })
      setOpen(false)
    } catch (cause) {
      toast.error(`Couldn't set the baseline. ${researchErrorText(cause)}`)
    } finally {
      setSaving(false)
    }
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="xs" variant="outline" disabled={!brief.available}>
          Choose baseline
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <div className="space-y-2 p-3">
          <Label htmlFor={id}>Baseline Run</Label>
          <Select
            disabled={saving || !choices.length}
            onValueChange={(value) => void choose(value)}
          >
            <SelectTrigger id={id} className="w-full" aria-label="Baseline Run">
              <SelectValue placeholder={choices.length ? 'Choose a Run' : 'No Runs yet'} />
            </SelectTrigger>
            <SelectContent>
              {choices.map((choice) => (
                <SelectItem key={choice.reference} value={choice.reference}>
                  {choice.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Saved to the plan. Rule checks, Run summaries, and agent reviews compare against it.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** The one action that resolves the finding, when there is one; Ask agent and Dismiss sit beside it. */
export function ResearchNeedsYouFixAction({
  workspace,
  finding
}: {
  workspace: ExperimentWorkspace
  finding: ResearchFinding
}): React.JSX.Element | null {
  const reference = finding.runs[0]
  switch (findingFix(finding)) {
    case 'mark-failed':
      return reference ? <MarkFailedAction workspace={workspace} reference={reference} /> : null
    case 'choose-baseline':
      return <ChooseBaselineAction workspace={workspace} />
    case 'open-writing':
      return (
        <Button size="xs" variant="outline" onClick={() => openResearchView('research-writing')}>
          Open in Writing
        </Button>
      )
    case null:
      return null
  }
}
