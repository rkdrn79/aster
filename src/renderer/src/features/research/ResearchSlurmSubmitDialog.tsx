import { useState } from 'react'
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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { ResearchComputeSample } from '../../../../shared/research/research-compute-probe'
import { buildSlurmSubmitCommand } from '../../../../shared/research/research-slurm-actions'
import { matchResearchComputeFolder } from '../../../../shared/research/research-compute-folder-match'
import {
  decideGpuSubmission,
  type ResearchGpuHostBudget
} from '../../../../shared/research/research-gpu-budget'
import { asterSlurmJobComment } from '../../../../shared/research/research-gpu-policy'
import { formatSlurmTimestamp } from './research-compute-format'
import type { ResearchComputeWorkspace } from './research-compute-workspaces'
import { chooseResearchGpuPlacement } from './research-gpu-placement'
import { ResearchSlurmPlacementFields } from './ResearchSlurmPlacementFields'
import {
  DEFAULT_PARTITION,
  draftRequest,
  projectRoots,
  type Fields
} from './research-slurm-submit-request'
import { summarizeSlurmPartitions } from './research-slurm-summary'

export type SlurmSubmitHost = {
  targetId: string
  label: string
  sample: ResearchComputeSample
  workspaces: readonly ResearchComputeWorkspace[]
  dial: boolean
  /** Null when the user set no GPU limits for this host. */
  budget: ResearchGpuHostBudget | null
}

function SubmitDialogBody({
  hosts,
  initialTargetId,
  onClose,
  onSubmitted
}: {
  hosts: readonly SlurmSubmitHost[]
  initialTargetId: string
  onClose: () => void
  onSubmitted: (targetId: string) => void
}): React.JSX.Element {
  const [targetId, setTargetId] = useState(initialTargetId)
  const [placementMode, setPlacementMode] = useState<'manual' | 'auto'>('manual')
  const [autoProjectKey, setAutoProjectKey] = useState('')
  const [fields, setFields] = useState<Fields>({
    workDir: '',
    runKind: 'script',
    scriptPath: '',
    command: '',
    jobName: '',
    partition: DEFAULT_PARTITION,
    gpus: '1',
    cpusPerTask: '',
    memory: '',
    timeLimit: ''
  })
  const [busy, setBusy] = useState<'check' | 'submit' | null>(null)
  const [outcome, setOutcome] = useState<{ ok: boolean; text: string } | null>(null)
  const linkedProjects = [
    ...new Map(
      hosts.flatMap((entry) =>
        entry.workspaces.map((workspace) => [workspace.projectKey, workspace.projectName] as const)
      )
    ).entries()
  ]
  const requestedGpus = /^\d+$/.test(fields.gpus.trim()) ? Number(fields.gpus) : 0
  const placement = chooseResearchGpuPlacement(
    hosts.flatMap((entry) =>
      entry.workspaces
        .filter((workspace) => workspace.projectKey === autoProjectKey)
        .map((workspace) => ({
          targetId: entry.targetId,
          label: entry.label,
          workDir: workspace.path,
          budget: entry.budget
        }))
    ),
    autoProjectKey,
    requestedGpus
  )
  const host =
    hosts.find(
      (entry) => entry.targetId === (placementMode === 'auto' ? placement?.targetId : targetId)
    ) ?? hosts[0]
  const partitions = summarizeSlurmPartitions(host.sample)
  const roots = projectRoots(host.workspaces)
  const { request, problem } = draftRequest({
    ...fields,
    workDir: placementMode === 'auto' ? (placement?.workDir ?? '') : fields.workDir
  })
  const project =
    matchResearchComputeFolder({ cwd: request?.workDir ?? '', command: null }, host.workspaces, {})
      ?.folder ?? null
  const verdict = decideGpuSubmission(host.budget, project?.projectKey ?? null, request?.gpus ?? 0)
  const set = (patch: Partial<Fields>): void => {
    setFields((current) => ({ ...current, ...patch }))
    setOutcome(null)
  }

  async function run(testOnly: boolean): Promise<void> {
    if (placementMode === 'auto' && !placement) {
      setOutcome({ ok: false, text: 'No linked host has a verified GPU budget for this project.' })
      return
    }
    if (!request) {
      setOutcome({ ok: false, text: problem ?? 'Check the job fields.' })
      return
    }
    setBusy(testOnly ? 'check' : 'submit')
    setOutcome(null)
    try {
      const result = await window.api.researchCompute.submitJob({
        targetId: host.targetId,
        dial: host.dial,
        request,
        testOnly,
        projectKey: project?.projectKey
      })
      if (result.ok && !testOnly) {
        toast.success(
          result.held ? result.message : `Submitted job ${result.jobId} on ${host.label}`
        )
        onSubmitted(host.targetId)
        onClose()
        return
      }
      const estimate = result.estimate
      setOutcome({
        ok: result.ok,
        text: estimate
          ? `Estimated start ${formatSlurmTimestamp(estimate.startTime)}${estimate.nodes ? ` on ${estimate.nodes}` : ''}${estimate.partition ? ` (${estimate.partition})` : ''}. No job was created.${verdict.hold ? ` Under your GPU limits it would wait held: ${verdict.reason}` : ''}`
          : result.message
      })
    } catch (cause) {
      setOutcome({ ok: false, text: String(cause) })
    } finally {
      setBusy(null)
    }
  }

  return (
    <DialogContent className="sm:max-w-2xl" scrollable>
      <DialogHeader>
        <DialogTitle>New SLURM job</DialogTitle>
        <DialogDescription>
          Runs sbatch on the host as you. Check start time asks the scheduler for an estimate
          without creating a job.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 text-xs sm:grid-cols-2">
        <ResearchSlurmPlacementFields
          placementMode={placementMode}
          setPlacementMode={(mode) => {
            setPlacementMode(mode)
            set({ partition: DEFAULT_PARTITION })
          }}
          hosts={hosts}
          hostId={host.targetId}
          setHostId={(id) => {
            setTargetId(id)
            set({ partition: DEFAULT_PARTITION })
          }}
          roots={roots}
          workDir={fields.workDir}
          setWorkDir={(path) => set({ workDir: path })}
          autoProjectKey={autoProjectKey}
          setAutoProjectKey={(key) => {
            setAutoProjectKey(key)
            set({ partition: DEFAULT_PARTITION })
          }}
          linkedProjects={linkedProjects}
          placement={placement}
        />
        <div className="space-y-2 sm:col-span-2">
          <ToggleGroup
            type="single"
            variant="segmented"
            size="xs"
            spacing={1}
            value={fields.runKind}
            aria-label="What to run"
            onValueChange={(next) => {
              if (next === 'script' || next === 'command') {
                set({ runKind: next })
              }
            }}
          >
            <ToggleGroupItem value="script">Batch script</ToggleGroupItem>
            <ToggleGroupItem value="command">Command</ToggleGroupItem>
          </ToggleGroup>
          {fields.runKind === 'script' ? (
            <Input
              value={fields.scriptPath}
              onChange={(event) => set({ scriptPath: event.target.value })}
              placeholder="scripts/train.sbatch"
              aria-label="Batch script path"
            />
          ) : (
            <Textarea
              value={fields.command}
              onChange={(event) => set({ command: event.target.value })}
              placeholder="python train.py --config configs/lora.yaml"
              aria-label="Command"
              rows={3}
              variant="code"
              className="resize-y"
            />
          )}
          <p className="text-muted-foreground">
            {fields.runKind === 'script'
              ? 'Relative to the working directory. Fields you leave empty keep the script’s #SBATCH lines.'
              : 'sbatch --wrap runs this with /bin/sh in the working directory.'}
          </p>
        </div>
        <div className="space-y-1 sm:col-span-2">
          <p className="font-medium">Partition</p>
          <Select value={fields.partition} onValueChange={(partition) => set({ partition })}>
            <SelectTrigger className="w-full" aria-label="Partition">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={DEFAULT_PARTITION}>Cluster default</SelectItem>
              {partitions.map((partition) => (
                <SelectItem key={partition.partition} value={partition.partition}>
                  {partition.partition} · {partition.gpuUnallocated} of {partition.gpuTotal} GPUs
                  unallocated · {partition.pendingJobs} pending
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {(
          [
            ['gpus', 'GPUs', '1'],
            ['cpusPerTask', 'CPUs per task', '8'],
            ['memory', 'Memory', '64G'],
            ['timeLimit', 'Time limit', '1-00:00:00']
          ] as const
        ).map(([key, label, placeholder]) => (
          <label key={key} className="space-y-1 font-medium">
            {label}
            <Input
              value={fields[key]}
              onChange={(event) => set({ [key]: event.target.value })}
              placeholder={placeholder}
              className="mt-1"
            />
          </label>
        ))}
        <label className="space-y-1 font-medium sm:col-span-2">
          Job name
          <Input
            value={fields.jobName}
            onChange={(event) => set({ jobName: event.target.value })}
            placeholder="Script or command name when empty"
            className="mt-1"
          />
        </label>
        <div className="space-y-1 sm:col-span-2">
          <p className="font-medium">Runs on {host.label}</p>
          <pre className="scrollbar-sleek max-h-28 overflow-auto whitespace-pre-wrap break-all rounded-md border border-border bg-muted/40 p-3 font-mono text-muted-foreground">
            {request
              ? buildSlurmSubmitCommand(request, false, {
                  hold: verdict.hold,
                  comment: project ? asterSlurmJobComment(project.projectKey) : undefined
                })
              : problem}
          </pre>
          <p className="text-muted-foreground">
            {project ? `Counts toward ${project.projectName}. ` : 'Not in an open project folder. '}
            {host.budget
              ? verdict.hold
                ? `Over your GPU limits, so it waits held: ${verdict.reason}`
                : `Fits your GPU limits (${host.budget.usedGpus} of ${host.budget.maxGpus} in use).`
              : 'No GPU limits are set for this host.'}
          </p>
        </div>
        {outcome ? (
          <p
            role={outcome.ok ? 'status' : 'alert'}
            className={outcome.ok ? 'sm:col-span-2' : 'text-destructive sm:col-span-2'}
          >
            {outcome.text}
          </p>
        ) : null}
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose} disabled={busy !== null}>
          Close
        </Button>
        <Button
          variant="outline"
          onClick={() => void run(true)}
          disabled={busy !== null || (placementMode === 'auto' && !placement)}
        >
          {busy === 'check' ? 'Checking…' : 'Check start time'}
        </Button>
        <Button
          onClick={() => void run(false)}
          disabled={busy !== null || (placementMode === 'auto' && !placement)}
        >
          {busy === 'submit' ? 'Submitting…' : 'Submit job'}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}

export function ResearchSlurmSubmitDialog({
  open,
  hosts,
  onClose,
  onSubmitted
}: {
  open: boolean
  hosts: readonly SlurmSubmitHost[]
  onClose: () => void
  onSubmitted: (targetId: string) => void
}): React.JSX.Element {
  const startHost = hosts[0]
  return (
    <Dialog open={open && Boolean(startHost)} onOpenChange={(next) => !next && onClose()}>
      {open && startHost ? (
        <SubmitDialogBody
          hosts={hosts}
          initialTargetId={startHost.targetId}
          onClose={onClose}
          onSubmitted={onSubmitted}
        />
      ) : null}
    </Dialog>
  )
}
