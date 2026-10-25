import { HostCombobox } from '@/components/host-picker/HostCombobox'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { GpuPlacement } from './research-gpu-placement'
import type { ResearchComputeWorkspace } from './research-compute-workspaces'

export function ResearchSlurmPlacementFields({
  placementMode,
  setPlacementMode,
  hosts,
  hostId,
  setHostId,
  roots,
  workDir,
  setWorkDir,
  autoProjectKey,
  setAutoProjectKey,
  linkedProjects,
  placement
}: {
  placementMode: 'manual' | 'auto'
  setPlacementMode: (mode: 'manual' | 'auto') => void
  hosts: readonly { targetId: string; label: string }[]
  hostId: string
  setHostId: (id: string) => void
  roots: readonly ResearchComputeWorkspace[]
  workDir: string
  setWorkDir: (path: string) => void
  autoProjectKey: string
  setAutoProjectKey: (key: string) => void
  linkedProjects: readonly (readonly [string, string])[]
  placement: GpuPlacement | null
}): React.JSX.Element {
  return (
    <>
      <div className="space-y-2 sm:col-span-2">
        <ToggleGroup
          type="single"
          variant="segmented"
          size="xs"
          spacing={1}
          value={placementMode}
          aria-label="Host placement"
          onValueChange={(next) => {
            if (next === 'manual' || next === 'auto') {
              setPlacementMode(next)
            }
          }}
        >
          <ToggleGroupItem value="manual">Choose host</ToggleGroupItem>
          <ToggleGroupItem value="auto">Auto place</ToggleGroupItem>
        </ToggleGroup>
        <p className="text-muted-foreground">
          Auto place picks a linked folder within your GPU limits. Files must already be on the
          host.
        </p>
      </div>
      {placementMode === 'manual' ? (
        <>
          <div className="space-y-1">
            <p className="font-medium">Host</p>
            <HostCombobox
              value={hostId}
              onChange={setHostId}
              options={hosts.map((entry) => ({ id: entry.targetId, label: entry.label }))}
              ariaLabel="Host"
              className="w-full"
            />
          </div>
          <div className="space-y-1">
            <p className="font-medium">Project folder</p>
            <Select
              value={roots.some((root) => root.path === workDir) ? workDir : ''}
              onValueChange={setWorkDir}
              disabled={!roots.length}
            >
              <SelectTrigger className="w-full" aria-label="Project folder">
                <SelectValue
                  placeholder={roots.length ? 'Choose a project' : 'No linked folders'}
                />
              </SelectTrigger>
              <SelectContent>
                {roots.map((root) => (
                  <SelectItem key={root.path} value={root.path}>
                    {root.projectName} · {root.workspaceName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="space-y-1 font-medium sm:col-span-2">
            Working directory
            <Input
              value={workDir}
              onChange={(event) => setWorkDir(event.target.value)}
              placeholder="/data/projects/me/my-project"
              className="mt-1"
            />
          </label>
        </>
      ) : (
        <div className="space-y-1 sm:col-span-2">
          <p className="font-medium">Project to place</p>
          <Select value={autoProjectKey} onValueChange={setAutoProjectKey}>
            <SelectTrigger className="w-full" aria-label="Project to place">
              <SelectValue placeholder="Choose a linked project" />
            </SelectTrigger>
            <SelectContent>
              {linkedProjects.map(([key, name]) => (
                <SelectItem key={key} value={key}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-muted-foreground">
            {placement
              ? `${placement.label} · ${placement.workDir}${placement.held ? ` · waits held: ${placement.reason}` : ''}`
              : 'Link this project on a readable host and set its GPU limits first.'}
          </p>
        </div>
      )}
    </>
  )
}
