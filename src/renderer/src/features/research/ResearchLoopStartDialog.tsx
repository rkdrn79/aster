import { useEffect, useId, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useAgentMenuObservation } from '@/components/tab-bar/use-new-tab-agent-menu-rows'
import { useAgentDetectionTargetForWorktree } from '@/hooks/useAgentDetectionTarget'
import { useAppStore } from '@/store'
import type { TuiAgent } from '../../../../shared/tui-agent'
import { formatAgentTypeLabel } from '../../../../shared/agent-type-label'
import type { ResearchProjectContext } from '../../../../shared/research/research-harness-results'
import { researchErrorText } from './research-error-text'
import { startResearchLoop } from './research-loop-launch'
import { useResearchRecords } from './research-records-store'
import { selectResearchWorkspaceContext } from './research-workspace-context'
import { researchHarnessBridge } from './use-research-harness-experiment'
import { useExperimentBrief } from './research-experiment-brief-state'
import { Field, LoopBudgetFields } from './ResearchLoopStartFields'
import {
  loopPrefillFromBrief,
  loopStartBlocker,
  type LoopDirection
} from './research-loop-start-form'

const NEW_EXPERIMENT = '__new__'
// Why: the loop and track skills are written for, and installed into, these two agents.
const LOOP_AGENTS = new Set<TuiAgent>(['claude', 'codex'])

type Context = ReturnType<typeof selectResearchWorkspaceContext>

function positiveNumber(value: string): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function LoopStartBody({
  context,
  workspaceId,
  workspacePath,
  hostId,
  onClose
}: {
  context: Context
  workspaceId: string
  workspacePath: string
  hostId: string
  onClose: () => void
}): React.JSX.Element {
  const ids = useId()
  const document = useResearchRecords((state) => state.document)
  const experiments =
    document?.experiments.filter(
      (entry) =>
        entry.workspaceId === workspaceId &&
        entry.hostId === hostId &&
        entry.catalogSlug &&
        !entry.archived
    ) ?? []
  const selectedExperimentId = document?.selectedExperimentId
  const [experimentKey, setExperimentKey] = useState(
    () =>
      experiments.find((entry) => entry.id === selectedExperimentId)?.id ??
      experiments[0]?.id ??
      NEW_EXPERIMENT
  )
  const [experimentName, setExperimentName] = useState('')
  // Null until the user edits a field, so it follows the selected Experiment's plan until then.
  const [objectiveInput, setObjective] = useState<string | null>(null)
  const [metricInput, setMetric] = useState<string | null>(null)
  const [directionInput, setDirection] = useState<LoopDirection | null>(null)
  const [maxRuns, setMaxRuns] = useState('10')
  const [maxHours, setMaxHours] = useState('8')
  const [parallel, setParallel] = useState('1')
  const [gpuPolicy, setGpuPolicy] = useState('')
  const [agentKey, setAgentKey] = useState('')
  const [projectContext, setProjectContext] = useState<ResearchProjectContext | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const detectionTarget = useAgentDetectionTargetForWorktree(workspaceId)
  const { model: menu } = useAgentMenuObservation(workspaceId, true, detectionTarget)
  const agents =
    menu.state === 'settled'
      ? menu.rows.flatMap((row) =>
          row.kind !== 'chat-unavailable' && LOOP_AGENTS.has(row.agent)
            ? [
                {
                  key: `${row.kind}:${row.agent}`,
                  agent: row.agent,
                  surface: row.kind === 'chat' ? ('chat' as const) : ('terminal' as const)
                }
              ]
            : []
        )
      : []
  const agent =
    agents.find((row) => row.key === agentKey) ??
    agents.find((row) => row.surface === 'chat') ??
    agents[0]

  useEffect(() => {
    let active = true
    researchHarnessBridge()
      .context?.({ workspacePath })
      .then(
        (value) => {
          if (active) {
            setProjectContext(value)
          }
        },
        () => undefined
      )
    return () => {
      active = false
    }
  }, [workspacePath])

  const chosen = experiments.find((entry) => entry.id === experimentKey)
  const { brief } = useExperimentBrief(chosen)
  const prefill = loopPrefillFromBrief(chosen ? brief : null)
  const objective = objectiveInput ?? prefill.objective
  const metric = metricInput ?? prefill.metric
  const direction = directionInput ?? prefill.direction
  const metricChoices = [
    ...new Map(
      (projectContext?.experiments.find((entry) => entry.slug === chosen?.catalogSlug)?.runs ?? [])
        .flatMap((run) => run.metrics)
        .map((series) => [series.name, series.direction] as const)
    )
  ]
  const runs = positiveNumber(maxRuns)
  const hours = positiveNumber(maxHours)
  const blocker = loopStartBlocker({
    objective,
    metric,
    gpuPolicy,
    budgetValid: Boolean(runs && hours),
    hasAgent: Boolean(agent),
    needsExperimentName: experimentKey === NEW_EXPERIMENT && !experimentName.trim()
  })
  const ready = blocker === null

  function chooseMetric(value: string): void {
    setMetric(value)
    const known = metricChoices.find(([name]) => name === value.trim())?.[1]
    if (known) {
      setDirection(known)
    }
  }

  async function start(): Promise<void> {
    if (!ready || busy || !agent || !runs || !hours) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      const isNew = experimentKey === NEW_EXPERIMENT
      await startResearchLoop({
        context,
        newExperimentName: isNew ? experimentName.trim() : null,
        contract: {
          experiment: isNew ? '' : (chosen?.catalogSlug ?? ''),
          objective: objective.trim(),
          metric: metric.trim(),
          direction,
          maxRuns: Math.round(runs),
          maxHours: hours,
          maxParallel: Number(parallel),
          gpuPolicy: gpuPolicy.trim()
        },
        agent: agent.agent,
        surface: agent.surface
      })
      onClose()
      toast.success('Research loop started. Its steps appear on the Runs page.')
    } catch (cause) {
      setError(researchErrorText(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <DialogContent className="sm:max-w-lg" scrollable>
      <DialogHeader>
        <DialogTitle>Start research loop</DialogTitle>
        <DialogDescription>
          An agent runs experiments toward your objective and stops at the budget.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <Field label="Objective" htmlFor={`${ids}-objective`} required>
          <Textarea
            id={`${ids}-objective`}
            value={objective}
            onChange={(event) => setObjective(event.target.value)}
            placeholder="Lower validation loss below 0.30 without a larger model"
            className="min-h-20"
            maxLength={4000}
          />
        </Field>
        <Field label="Experiment">
          <Select value={experimentKey} onValueChange={setExperimentKey}>
            <SelectTrigger className="w-full" aria-label="Experiment">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {experiments.map((entry) => (
                <SelectItem key={entry.id} value={entry.id}>
                  {entry.name}
                </SelectItem>
              ))}
              <SelectItem value={NEW_EXPERIMENT}>New experiment…</SelectItem>
            </SelectContent>
          </Select>
          {experimentKey === NEW_EXPERIMENT ? (
            <Input
              value={experimentName}
              onChange={(event) => setExperimentName(event.target.value)}
              placeholder="Experiment name"
              aria-label="New experiment name"
              maxLength={120}
            />
          ) : null}
        </Field>
        <div className="grid grid-cols-[minmax(0,1fr)_10rem] gap-3">
          <Field label="Primary metric" htmlFor={`${ids}-metric`} required>
            <Input
              id={`${ids}-metric`}
              value={metric}
              onChange={(event) => chooseMetric(event.target.value)}
              placeholder="val_loss"
              list={`${ids}-metrics`}
              maxLength={120}
            />
            <datalist id={`${ids}-metrics`}>
              {metricChoices.map(([name]) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            {prefill.fromPlan && metricInput === null && directionInput === null ? (
              <p className="text-xs text-muted-foreground">
                From the plan{prefill.split ? ` · ${prefill.split} split` : ''}
              </p>
            ) : null}
          </Field>
          <Field label="Goal">
            <Select
              value={direction}
              onValueChange={(value) =>
                setDirection(value === 'maximize' ? 'maximize' : 'minimize')
              }
            >
              <SelectTrigger className="w-full" aria-label="Metric goal">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="minimize">Lower is better</SelectItem>
                <SelectItem value="maximize">Higher is better</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
        <LoopBudgetFields
          idPrefix={ids}
          maxRuns={maxRuns}
          maxHours={maxHours}
          parallel={parallel}
          runsValid={runs !== null}
          hoursValid={hours !== null}
          onMaxRuns={setMaxRuns}
          onMaxHours={setMaxHours}
          onParallel={setParallel}
        />
        <Field label="Compute policy" htmlFor={`${ids}-compute-policy`} required>
          <Input
            id={`${ids}-compute-policy`}
            value={gpuPolicy}
            onChange={(event) => setGpuPolicy(event.target.value)}
            placeholder="CPU only, or approved host and GPU limit"
            maxLength={4000}
          />
          <p className="text-xs text-muted-foreground">
            Sent to the agent as an execution limit; this does not reserve a GPU.
          </p>
        </Field>
        <Field label="Agent">
          <Select value={agent?.key ?? ''} onValueChange={setAgentKey} disabled={!agents.length}>
            <SelectTrigger className="w-full" aria-label="Agent">
              <SelectValue
                placeholder={menu.state === 'loading' ? 'Checking agents…' : 'No agent available'}
              />
            </SelectTrigger>
            <SelectContent>
              {agents.map((row) => (
                <SelectItem key={row.key} value={row.key}>
                  {formatAgentTypeLabel(row.agent)}
                  {row.surface === 'chat' ? '' : ' · terminal'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {menu.state === 'settled' && !agents.length ? (
            <p className="text-xs text-muted-foreground">Install Claude Code or Codex first.</p>
          ) : null}
        </Field>
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </div>
      <DialogFooter className="items-center">
        {blocker && menu.state === 'settled' ? (
          <p className="mr-auto text-xs text-muted-foreground" role="status">
            {blocker}
          </p>
        ) : null}
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button disabled={!ready || busy} onClick={() => void start()}>
          {busy ? 'Starting…' : 'Start loop'}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}

export function ResearchLoopStartDialog({
  open,
  onClose
}: {
  open: boolean
  onClose: () => void
}): React.JSX.Element {
  const context = useAppStore(useShallow(selectResearchWorkspaceContext))
  const { workspaceId, workspacePath, hostId } = context
  const supported = typeof researchHarnessBridge().loopStart === 'function'
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      {open && workspaceId && workspacePath && hostId === 'local' && supported ? (
        <LoopStartBody
          context={context}
          workspaceId={workspaceId}
          workspacePath={workspacePath}
          hostId={hostId}
          onClose={onClose}
        />
      ) : open ? (
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Start research loop</DialogTitle>
            <DialogDescription>
              {supported
                ? 'Research loops run in local projects for now.'
                : 'Restart the app to start research loops.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  )
}
