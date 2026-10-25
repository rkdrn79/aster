import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import {
  RESEARCH_GPU_PRIORITIES,
  type ResearchGpuPolicy,
  type ResearchGpuPriority,
  type ResearchGpuProjectPolicy
} from '../../../../shared/research/research-gpu-policy'

export type GpuLimitsTarget = {
  targetId: string
  hostLabel: string
  /** Open projects with a folder on this host. */
  projects: { projectKey: string; projectName: string }[]
}

type ProjectRow = {
  projectKey: string
  projectName: string
  cap: string
  priority: ResearchGpuPriority
}

const PRIORITY_LABELS: Record<ResearchGpuPriority, string> = {
  high: 'High',
  normal: 'Normal',
  low: 'Low'
}

function parseCount(value: string): number | null | 'invalid' {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }
  return /^\d+$/.test(trimmed) && Number(trimmed) <= 1024 ? Number(trimmed) : 'invalid'
}

function LimitsBody({
  target,
  policy,
  onClose,
  onSave
}: {
  target: GpuLimitsTarget
  policy: ResearchGpuPolicy
  onClose: () => void
  onSave: (next: ResearchGpuPolicy) => Promise<void>
}): React.JSX.Element {
  const host = policy.hosts.find((entry) => entry.targetId === target.targetId)
  const [maxGpus, setMaxGpus] = useState(host ? String(host.maxGpus) : '')
  const [autoRelease, setAutoRelease] = useState(host?.autoRelease ?? true)
  const [rows, setRows] = useState<ProjectRow[]>(() =>
    target.projects.map(({ projectKey, projectName }) => {
      const saved = policy.projects.find(
        (entry) => entry.targetId === target.targetId && entry.projectKey === projectKey
      )
      return {
        projectKey,
        projectName,
        cap: saved?.maxGpus === null || saved === undefined ? '' : String(saved.maxGpus),
        priority: saved?.priority ?? 'normal'
      }
    })
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const others = {
    hosts: policy.hosts.filter((entry) => entry.targetId !== target.targetId),
    projects: policy.projects.filter((entry) => entry.targetId !== target.targetId)
  }

  async function persist(next: ResearchGpuPolicy): Promise<void> {
    setSaving(true)
    setError(null)
    try {
      await onSave(next)
      onClose()
    } catch (cause) {
      setError(`GPU limits were not saved. ${String(cause)}`)
      setSaving(false)
    }
  }

  function save(): void {
    const max = parseCount(maxGpus)
    if (max === null || max === 'invalid') {
      setError('Enter your max GPUs on this host as a whole number.')
      return
    }
    const projects: ResearchGpuProjectPolicy[] = []
    for (const row of rows) {
      const cap = parseCount(row.cap)
      if (cap === 'invalid') {
        setError(`${row.projectName}: the cap must be a whole number, or empty for none.`)
        return
      }
      projects.push({
        targetId: target.targetId,
        projectKey: row.projectKey,
        projectName: row.projectName,
        maxGpus: cap,
        priority: row.priority
      })
    }
    void persist({
      schemaVersion: 1,
      hosts: [...others.hosts, { targetId: target.targetId, maxGpus: max, autoRelease }],
      projects: [...others.projects, ...projects]
    })
  }

  const update = (projectKey: string, patch: Partial<ProjectRow>): void =>
    setRows((current) =>
      current.map((row) => (row.projectKey === projectKey ? { ...row, ...patch } : row))
    )

  return (
    <DialogContent className="sm:max-w-xl" scrollable>
      <DialogHeader>
        <DialogTitle>GPU limits on {target.hostLabel}</DialogTitle>
        <DialogDescription>
          Jobs submitted here that would pass these limits wait in the queue. While the app is open,
          they are released by priority, then age, as GPUs free up.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4 text-xs">
        <label className="block space-y-1 font-medium">
          Your max GPUs on this host
          <Input
            value={maxGpus}
            onChange={(event) => setMaxGpus(event.target.value)}
            placeholder="8"
            className="mt-1 w-32"
            autoFocus
          />
        </label>
        <label className="flex items-center gap-2">
          <Checkbox
            checked={autoRelease}
            onCheckedChange={(checked) => setAutoRelease(checked === true)}
          />
          Release held jobs automatically when they fit
        </label>
        <div className="space-y-2">
          <p className="font-medium">Projects</p>
          {rows.length ? (
            <div className="divide-y divide-border rounded-lg border border-border">
              {rows.map((row) => (
                <div key={row.projectKey} className="flex items-center gap-3 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate">{row.projectName}</span>
                  <Input
                    value={row.cap}
                    onChange={(event) => update(row.projectKey, { cap: event.target.value })}
                    placeholder="No cap"
                    aria-label={`${row.projectName} max GPUs`}
                    className="w-24"
                  />
                  <Select
                    value={row.priority}
                    onValueChange={(priority) => {
                      const next = RESEARCH_GPU_PRIORITIES.find((entry) => entry === priority)
                      if (next) {
                        update(row.projectKey, { priority: next })
                      }
                    }}
                  >
                    <SelectTrigger className="w-28" aria-label={`${row.projectName} priority`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RESEARCH_GPU_PRIORITIES.map((priority) => (
                        <SelectItem key={priority} value={priority}>
                          {PRIORITY_LABELS[priority]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">
              No open project has a folder on this host yet. Link one under Linked project folders
              to give it a cap and priority.
            </p>
          )}
        </div>
        {error ? (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        ) : null}
      </div>
      <DialogFooter>
        {host ? (
          <Button
            variant="ghost"
            className="sm:mr-auto"
            title="Held jobs on this host are released."
            disabled={saving}
            onClick={() => void persist({ schemaVersion: 1, ...others })}
          >
            Remove limits
          </Button>
        ) : null}
        <Button variant="ghost" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save limits'}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}

export function ResearchGpuLimitsDialog({
  target,
  onClose,
  ...props
}: {
  target: GpuLimitsTarget | null
  policy: ResearchGpuPolicy
  onClose: () => void
  onSave: (next: ResearchGpuPolicy) => Promise<void>
}): React.JSX.Element {
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      {target ? (
        <LimitsBody key={target.targetId} target={target} onClose={onClose} {...props} />
      ) : null}
    </Dialog>
  )
}
