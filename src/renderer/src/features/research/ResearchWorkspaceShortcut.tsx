import { useShallow } from 'zustand/react/shallow'
import { Check, ChevronsUpDown, FolderOpen, GitBranchPlus, Search } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useAppStore } from '@/store'
import { selectResearchWorkspaceContext } from './research-workspace-context'
import { enterResearchWorkspace, selectResearchInsideProject } from './research-navigation'
import { useResearchActiveProject } from './research-home-projects'
import { canCreateResearchWorktree, openResearchNewWorktree } from './research-new-worktree'
import { useRemoteHostLabel } from './research-host-label'

export function ResearchWorkspaceShortcut(): React.JSX.Element | null {
  const insideProject = useAppStore(selectResearchInsideProject)
  return insideProject ? <ResearchWorkspaceSwitcher /> : null
}

/** The open project's workspaces; other projects are one step back, on the home screen. */
function ResearchWorkspaceSwitcher(): React.JSX.Element {
  const context = useAppStore(useShallow(selectResearchWorkspaceContext))
  const { project, workspace } = useResearchActiveProject()
  const canCreateWorktree = useAppStore((state) => canCreateResearchWorktree(state, workspace))
  const remoteHost = useRemoteHostLabel(context.hostId)
  const name = context.workspaceName ?? 'Choose workspace'
  // Why: researchers pick a workspace by name; the branch stays in the tooltip and the menu.
  const count = project?.workspaces.length ?? 0
  const detail = remoteHost ?? (count > 1 ? `${count} workspaces in this project` : null)
  const tooltip = [context.workspacePath, workspace?.branch ? `Branch ${workspace.branch}` : null]
    .filter(Boolean)
    .join('\n')

  return (
    <div className="mt-auto shrink-0 border-t border-worktree-sidebar-border p-2">
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Workspace: ${name}`}
            title={tooltip || undefined}
          >
            <FolderOpen className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{name}</span>
              {detail ? (
                <span className="block truncate text-xs text-muted-foreground">{detail}</span>
              ) : null}
            </span>
            <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="w-64 max-w-[calc(100vw-1rem)]">
          <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
          {(project?.workspaces ?? []).map((entry) => (
            <DropdownMenuItem
              key={entry.id}
              onSelect={() => {
                if (entry.id !== workspace?.id) {
                  enterResearchWorkspace(entry)
                }
              }}
            >
              <Check
                className={entry.id === workspace?.id ? 'size-4' : 'size-4 invisible'}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate">{entry.name}</span>
              {entry.branch && entry.branch !== entry.name ? (
                <span className="max-w-24 truncate text-xs text-muted-foreground">
                  {entry.branch}
                </span>
              ) : null}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!canCreateWorktree}
            onSelect={() => {
              if (workspace) {
                openResearchNewWorktree(workspace)
              }
            }}
          >
            <GitBranchPlus aria-hidden />
            New isolated copy…
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => useAppStore.getState().openModal('worktree-palette')}>
            <Search aria-hidden />
            Search all workspaces…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
