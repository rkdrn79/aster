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
import { HostCombobox } from '@/components/host-picker/HostCombobox'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { computeLinkFolderName, suggestComputeLinkFolders } from './research-compute-link-folders'
import type { ResearchComputeLinkInput } from './use-research-compute-links'

export type ComputeLinkDraft = {
  targetId: string
  /** The unmatched job's WorkDir it was opened from; null when adding a folder by hand. */
  directory: string | null
}

type LinkHost = { targetId: string; label: string; remoteUser: string | null }
type OpenProject = { id: string; displayName: string }

function folderProblem(path: string): string | null {
  if (!path.startsWith('/') || path.replace(/\/+$/, '') === '') {
    return 'Use an absolute folder path on the host, other than /.'
  }
  return /[\0\t\n\r]/.test(path) ? 'Folder paths cannot contain tabs or line breaks.' : null
}

function LinkDialogBody({
  draft,
  hosts,
  projects,
  onClose,
  onSave
}: {
  draft: ComputeLinkDraft
  hosts: readonly LinkHost[]
  projects: readonly OpenProject[]
  onClose: () => void
  onSave: (link: ResearchComputeLinkInput) => Promise<void>
}): React.JSX.Element {
  const [targetId, setTargetId] = useState(draft.targetId)
  const host = hosts.find((entry) => entry.targetId === targetId)
  const suggestion = draft.directory
    ? suggestComputeLinkFolders(draft.directory, host?.remoteUser ?? null)
    : null
  const [folder, setFolder] = useState(suggestion?.preferred ?? '')
  const [projectId, setProjectId] = useState(() => {
    const folderName = computeLinkFolderName(suggestion?.preferred ?? '').toLowerCase()
    return projects.find((entry) => entry.displayName.toLowerCase() === folderName)?.id ?? ''
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const remotePath = folder.trim().replace(/(.)\/+$/, '$1')
  const project = projects.find((entry) => entry.id === projectId)
  const problem = folderProblem(remotePath) ?? (project ? null : 'Choose an open project.')

  async function save(): Promise<void> {
    if (problem) {
      setError(problem)
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave({
        targetId,
        remotePath,
        projectId: project?.id ?? null,
        projectName: project?.displayName ?? ''
      })
      onClose()
    } catch (cause) {
      setError(`The link was not saved. ${String(cause)}`)
      setSaving(false)
    }
  }

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Link a folder to a project</DialogTitle>
        <DialogDescription>
          Jobs that run in this folder show under the project. Nothing changes on the host.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4 text-xs">
        <div className="space-y-1">
          <p className="font-medium text-foreground">Host</p>
          {draft.directory ? (
            <p className="text-muted-foreground">{host?.label ?? targetId}</p>
          ) : (
            <HostCombobox
              value={targetId}
              onChange={setTargetId}
              options={hosts.map((entry) => ({ id: entry.targetId, label: entry.label }))}
              ariaLabel="Host"
              className="w-full"
            />
          )}
        </div>
        <label className="block space-y-1 font-medium text-foreground">
          Folder on the host
          <Input
            value={folder}
            onChange={(event) => setFolder(event.target.value)}
            placeholder="/data/projects/me/my-project"
            className="mt-1"
            autoFocus={!draft.directory}
          />
        </label>
        {suggestion && suggestion.folders.length > 1 ? (
          <div className="flex flex-wrap gap-1" role="group" aria-label="Suggested folders">
            {suggestion.folders.map((candidate) => (
              <Button
                key={candidate}
                variant={candidate === remotePath ? 'secondary' : 'ghost'}
                size="xs"
                aria-pressed={candidate === remotePath}
                onClick={() => setFolder(candidate)}
              >
                {computeLinkFolderName(candidate)}
              </Button>
            ))}
          </div>
        ) : null}
        <div className="space-y-1">
          <p className="font-medium text-foreground">Project</p>
          {projects.length ? (
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger className="w-full" aria-label="Project">
                <SelectValue placeholder="Choose an open project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((entry) => (
                  <SelectItem key={entry.id} value={entry.id}>
                    {entry.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-muted-foreground">Open a project first.</p>
          )}
        </div>
        {error ? (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        ) : null}
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={() => void save()} disabled={saving || !projects.length}>
          {saving ? 'Saving…' : 'Link folder'}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}

export function ResearchComputeLinkDialog({
  draft,
  onClose,
  ...props
}: {
  draft: ComputeLinkDraft | null
  hosts: readonly LinkHost[]
  projects: readonly OpenProject[]
  onClose: () => void
  onSave: (link: ResearchComputeLinkInput) => Promise<void>
}): React.JSX.Element {
  return (
    <Dialog open={draft !== null} onOpenChange={(open) => !open && onClose()}>
      {draft ? (
        <LinkDialogBody
          key={`${draft.targetId}:${draft.directory ?? ''}`}
          draft={draft}
          onClose={onClose}
          {...props}
        />
      ) : null}
    </Dialog>
  )
}
