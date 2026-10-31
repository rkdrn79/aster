import { Suspense, useEffect } from 'react'
import { FolderOpen } from 'lucide-react'
import { lazyWithRetry as lazy } from '@/lib/lazy-with-retry'
import { useAppStore } from '@/store'
import { activateAndRevealWorkspace } from '@/lib/worktree-activation'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { ResearchHomeWorkspace } from '@/features/research/research-home-projects'
import { PhoneEmptyState } from './PhoneListLayout'
import { usePhoneNavigation } from './phone-navigation-store'
import { PhonePapersList } from './PhonePapersList'
import { usePhoneFileOpenFollow } from './use-phone-file-open-follow'
import { phoneWorkspaceLabel, usePhoneProjects } from './use-phone-projects'

const FileExplorer = lazy(() => import('@/components/right-sidebar/FileExplorer'))

function openWorkspace(workspace: Pick<ResearchHomeWorkspace, 'id' | 'executionHostId'>): void {
  activateAndRevealWorkspace(
    workspace.id,
    workspace.executionHostId ? { executionHostId: workspace.executionHostId } : undefined
  )
}

/** The active workspace's files through the desktop explorer, and its project's papers. */
export function PhoneFilesScreen(): React.JSX.Element {
  const { projects, byWorkspaceId } = usePhoneProjects()
  const activeWorktreeId = useAppStore((state) => state.activeWorktreeId)
  const view = usePhoneNavigation((state) => state.filesView)
  const setView = usePhoneNavigation((state) => state.setFilesView)
  usePhoneFileOpenFollow()
  const active = activeWorktreeId ? byWorkspaceId.get(activeWorktreeId) : undefined
  const fallback = projects[0]?.workspaces[0]

  useEffect(() => {
    // Why: the explorer follows the active workspace, so start in the most recent one.
    if (!activeWorktreeId && fallback) {
      openWorkspace(fallback)
    }
  }, [activeWorktreeId, fallback])

  if (!fallback) {
    return (
      <PhoneEmptyState icon={FolderOpen} title="No projects on this host">
        Add a project on Home to browse its files.
      </PhoneEmptyState>
    )
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 px-4 pt-3 pb-1">
        <Select
          value={active?.workspace.id ?? ''}
          onValueChange={(id) => {
            const entry = byWorkspaceId.get(id)
            if (entry) {
              openWorkspace(entry.workspace)
            }
          }}
        >
          <SelectTrigger className="min-w-0 flex-1" aria-label="Workspace">
            <SelectValue placeholder="Choose a workspace" />
          </SelectTrigger>
          <SelectContent>
            {projects.flatMap((project) =>
              project.workspaces.map((workspace) => (
                <SelectItem key={workspace.id} value={workspace.id}>
                  {phoneWorkspaceLabel({ project, workspace })}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
        <Tabs
          className="w-44 shrink-0"
          value={view}
          onValueChange={(next) => setView(next === 'papers' ? 'papers' : 'files')}
        >
          <TabsList className="w-full">
            <TabsTrigger value="files">Files</TabsTrigger>
            <TabsTrigger value="papers">Papers</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      {!active ? (
        <PhoneEmptyState icon={FolderOpen} title="Choose a workspace" />
      ) : view === 'papers' ? (
        <PhonePapersList worktreeId={active.workspace.id} worktreePath={active.workspace.path} />
      ) : (
        // Why the row overrides: the explorer measures each row, so 44px touch rows stay virtualized.
        <div
          className="relative flex min-h-0 flex-1 flex-col [&_[data-file-explorer-row]]:min-h-11 [&_[data-file-explorer-row]]:gap-2 [&_[data-file-explorer-row]]:text-[15px] [&_[data-file-explorer-row]_svg]:size-4"
          data-phone-file-explorer=""
        >
          <Suspense fallback={null}>
            <FileExplorer />
          </Suspense>
        </div>
      )}
    </div>
  )
}
