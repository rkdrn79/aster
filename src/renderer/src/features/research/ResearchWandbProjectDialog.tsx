import { useEffect, useId, useMemo, useState } from 'react'
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
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { getRuntimePathBasename } from '../../../../shared/cross-platform-path'
import {
  wandbNameProblem,
  wandbProjectSlug,
  type ResearchProjectWandb
} from '../../../../shared/research/research-wandb'
import type { ResearchHomeProject } from './research-home-projects'
import { readProjectWandbCatalog, saveProjectWandbSettings } from './research-project-wandb'

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

/** Per-project W&B mirroring, saved in the project's own .aster/project.json. */
export function ResearchWandbProjectDialog({
  project,
  open,
  onOpenChange
}: {
  project: ResearchHomeProject
  open: boolean
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  const id = useId()
  const primary = project.workspaces[0]
  const owner = useMemo(
    () => ({
      hostId: primary.executionHostId ?? 'local',
      workspaceId: primary.id,
      workspacePath: primary.path
    }),
    [primary.executionHostId, primary.id, primary.path]
  )
  const suggested =
    wandbProjectSlug(project.name) ||
    wandbProjectSlug(getRuntimePathBasename(primary.path)) ||
    'aster'
  const [saved, setSaved] = useState<ResearchProjectWandb | null>(null)
  const [missing, setMissing] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [entity, setEntity] = useState('')
  const [wandbProject, setWandbProject] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }
    let active = true
    setLoading(true)
    setError(null)
    setMissing(null)
    readProjectWandbCatalog(owner)
      .then(
        (catalog) => {
          if (!active) {
            return
          }
          const settings = catalog.status === 'present' ? catalog.settings : null
          setMissing(catalog.status === 'missing' ? catalog.reason : null)
          setSaved(settings)
          setEnabled(settings?.enabled ?? false)
          setEntity(settings?.entity ?? '')
          setWandbProject(settings?.project ?? suggested)
        },
        (cause: unknown) => active && setMissing(errorText(cause))
      )
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [open, owner, suggested])

  async function save(): Promise<void> {
    const problem = enabled
      ? (wandbNameProblem(entity, 'Entity') ?? wandbNameProblem(wandbProject, 'W&B project'))
      : null
    if (problem) {
      setError(problem)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await saveProjectWandbSettings(owner, {
        enabled,
        entity: entity.trim() || null,
        project: wandbProject.trim() || null,
        python: saved?.python ?? null
      })
      onOpenChange(false)
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setBusy(false)
    }
  }

  const disabled = loading || busy || missing !== null
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="compact">
        <DialogHeader>
          <DialogTitle>W&B · {project.name}</DialogTitle>
          <DialogDescription>
            Runs started with run exec copy their recorded metrics to Weights & Biases: one W&B run
            per Aster Run, grouped by Experiment. Experiments, claims and notes stay in Aster.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {missing ? <p className="text-sm text-muted-foreground">{missing}</p> : null}
          <div className="flex items-center justify-between gap-3">
            <label htmlFor={`${id}-enabled`} className="text-sm">
              Mirror Run metrics to W&B
            </label>
            <Switch
              id={`${id}-enabled`}
              checked={enabled}
              disabled={disabled}
              onCheckedChange={setEnabled}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${id}-entity`}>Entity</Label>
            <Input
              id={`${id}-entity`}
              value={entity}
              disabled={disabled}
              onChange={(event) => setEntity(event.target.value)}
              placeholder="Team or username"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${id}-project`}>W&B project</Label>
            <Input
              id={`${id}-project`}
              value={wandbProject}
              disabled={disabled}
              onChange={(event) => setWandbProject(event.target.value)}
              placeholder={suggested}
              autoComplete="off"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Uploads use the wandb login of the computer that runs the training (wandb login). Aster
            never stores an API key. The setting is saved in .aster/project.json, so it travels with
            the project.
          </p>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button disabled={disabled} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
