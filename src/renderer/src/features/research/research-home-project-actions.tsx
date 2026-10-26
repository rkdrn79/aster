import { useState } from 'react'
import { toast } from 'sonner'
import {
  FolderOpen,
  FolderTree,
  Palette,
  Pencil,
  SquareTerminal,
  Trash2,
  MessageSquare
} from 'lucide-react'
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
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger
} from '@/components/ui/dropdown-menu'
import { ProjectGroupNameDialog } from '@/components/sidebar/ProjectGroupNameDialog'
import { blockRemovalForUnsavedFiles } from '@/components/sidebar/removal-unsaved-files'
import { isRevealOrEditorOpenBlocked } from '@/lib/local-path-open-guard'
import { getRevealInFileManagerLabel, revealInFileManager } from '@/lib/reveal-in-file-manager'
import { useAppStore } from '@/store'
import { REPO_COLORS } from '../../../../shared/constants'
import { getRepoExecutionHostId } from '../../../../shared/execution-host'
import { getFolderWorkspaceHostId } from '../../../../shared/folder-workspace-execution-host'
import { getProjectGroupSubtreeIds } from '../../../../shared/project-groups'
import { PRODUCT_NAME } from '../../../../shared/product-brand'
import { normalizeRepoBadgeColor } from '../../../../shared/repo-badge-color'
import type { ResearchHomeProject } from './research-home-projects'
import { catalogOwnsHost } from '@/store/slices/project-group-owner-routing'
import type { WorktreePurgeTarget } from '@/store/slices/worktree-helpers'
import { folderWorkspaceKey } from '../../../../shared/workspace-scope'
import { enterResearchWorkspace } from './research-navigation'
import { translate } from '@/i18n/i18n'
import { startResearchAdoptInBackground } from './research-adopt-conversation'

// Index-aligned with REPO_COLORS, which names them only in comments.
const COLOR_NAMES = ['Gray', 'Red', 'Orange', 'Yellow', 'Green', 'Teal', 'Purple', 'Pink']

/** Opens the project's workspace on the Workbench with a fresh terminal, as New Terminal Tab does. */
function openTerminalHere(project: ResearchHomeProject): void {
  const [primary] = project.workspaces
  enterResearchWorkspace(primary)
  const state = useAppStore.getState()
  if (state.activeWorktreeId !== primary.id) {
    return
  }
  state.setActiveView('terminal')
  const groupId =
    state.activeGroupIdByWorktree[primary.id] ?? state.groupsByWorktree[primary.id]?.[0]?.id
  if (groupId) {
    void state.openNewTerminalTabInActiveWorkspace(groupId)
    return
  }
  state.createTab(primary.id)
  state.setActiveTabType('terminal', primary.id)
}

async function saveProjectIdentity(
  project: ResearchHomeProject,
  updates: { name?: string; color?: string }
): Promise<void> {
  const [primary] = project.workspaces
  const state = useAppStore.getState()
  const repo = state.repos.find((entry) => entry.id === primary.repoId)
  const saved = project.projectGroupId
    ? await state.updateProjectGroup(project.projectGroupId, {
        ...(updates.name ? { name: updates.name } : {}),
        ...(updates.color ? { color: updates.color } : {})
      })
    : await state.updateRepo(
        primary.repoId,
        {
          ...(updates.name ? { displayName: updates.name } : {}),
          ...(updates.color ? { badgeColor: updates.color } : {})
        },
        repo ? { hostId: getRepoExecutionHostId(repo) } : undefined
      )
  if (!saved) {
    toast.error(updates.name ? 'Project was not renamed' : 'Project color was not changed')
  }
}

/** The rename dialog state a card owns; menu items only ask for it to open. */
export function useResearchProjectRename(project: ResearchHomeProject): {
  open: () => void
  dialog: React.JSX.Element
} {
  const [renaming, setRenaming] = useState(false)
  return {
    open: () => setRenaming(true),
    dialog: (
      <ProjectGroupNameDialog
        open={renaming}
        title="Rename project"
        description={`The name ${PRODUCT_NAME} shows for this project. Its folder is not renamed.`}
        initialName={project.name}
        confirmLabel="Rename"
        fieldLabel="Project name"
        onOpenChange={setRenaming}
        onSubmit={async (name) => {
          await saveProjectIdentity(project, { name })
          setRenaming(false)
        }}
      />
    )
  }
}

function folderProjectRemovalTargets(project: ResearchHomeProject): WorktreePurgeTarget[] {
  const groupId = project.projectGroupId
  const hostId = project.workspaces[0]?.executionHostId
  if (!groupId || !hostId) {
    return []
  }
  const state = useAppStore.getState()
  const ownerGroups = state.projectGroups.filter((group) =>
    catalogOwnsHost(hostId, getRepoExecutionHostId(group))
  )
  const groupIds = getProjectGroupSubtreeIds(ownerGroups, groupId)
  return state.folderWorkspaces
    .filter(
      (workspace) =>
        groupIds.has(workspace.projectGroupId) &&
        catalogOwnsHost(hostId, getFolderWorkspaceHostId(workspace, state.projectGroups))
    )
    .map((workspace) => ({
      id: folderWorkspaceKey(workspace.id),
      hostId: getFolderWorkspaceHostId(workspace, state.projectGroups)
    }))
}

/** Folder projects are project groups, not repos; removing the group forgets its folder workspaces. */
export function useResearchFolderProjectRemoval(project: ResearchHomeProject): {
  open: () => void
  dialog: React.JSX.Element
} {
  const [open, setOpen] = useState(false)
  const [removing, setRemoving] = useState(false)
  const groupId = project.projectGroupId
  const hostId = project.workspaces[0]?.executionHostId

  return {
    open: () => setOpen(true),
    dialog: (
      <Dialog open={open} onOpenChange={(nextOpen) => !removing && setOpen(nextOpen)}>
        <DialogContent surface="security" className="max-w-sm sm:max-w-sm" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Remove project from {PRODUCT_NAME}?</DialogTitle>
            <DialogDescription>
              {project.name} and its folder workspaces will leave the {PRODUCT_NAME} list. Files
              stay on their host. Conversations and open tabs for those workspaces may close. Git
              projects inside this group remain listed separately.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={removing} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={removing}
              onClick={() => {
                if (!groupId || !hostId) {
                  toast.error('Project host is unavailable')
                  return
                }
                const targets = folderProjectRemovalTargets(project)
                if (blockRemovalForUnsavedFiles(useAppStore.getState, targets, project.name)) {
                  return
                }
                setRemoving(true)
                void useAppStore
                  .getState()
                  .deleteProjectGroup(groupId, { hostId })
                  .then((removed) => {
                    if (removed) {
                      setOpen(false)
                    } else {
                      toast.error('Project could not be removed from Aster')
                    }
                  })
                  .finally(() => setRemoving(false))
              }}
            >
              {removing ? 'Removing…' : `Remove from ${PRODUCT_NAME}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }
}

/** Shared by the card's "⋯" button and its right-click menu. */
export function ResearchProjectMenuItems({
  project,
  onRename,
  onSlack,
  onRemoveFolderProject
}: {
  project: ResearchHomeProject
  onRename: () => void
  onSlack: () => void
  onRemoveFolderProject: () => void
}): React.JSX.Element {
  const [primary] = project.workspaces
  const owner = primary.executionHostId ?? 'unresolved'
  const selectedColor = normalizeRepoBadgeColor(project.badgeColor)
  const repo = useAppStore((state) =>
    project.projectGroupId
      ? undefined
      : state.repos.find(
          (entry) =>
            entry.id === primary.repoId && getRepoExecutionHostId(entry) === primary.executionHostId
        )
  )
  return (
    <>
      <DropdownMenuItem onSelect={onRename}>
        <Pencil aria-hidden />
        Rename…
      </DropdownMenuItem>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <Palette aria-hidden />
          Color
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuRadioGroup
            value={selectedColor ?? ''}
            onValueChange={(color) => void saveProjectIdentity(project, { color })}
          >
            {REPO_COLORS.map((color, index) => (
              <DropdownMenuRadioItem key={color} value={color}>
                <span className="size-3 rounded-full" style={{ backgroundColor: color }} />
                {COLOR_NAMES[index] ?? color}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        disabled={isRevealOrEditorOpenBlocked(owner)}
        onSelect={() => void revealInFileManager(primary.path, owner)}
      >
        <FolderOpen aria-hidden />
        {getRevealInFileManagerLabel()}
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => openTerminalHere(project)}>
        <SquareTerminal aria-hidden />
        Open terminal here
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={() =>
          void startResearchAdoptInBackground({
            workspaceId: primary.id,
            hostId: primary.executionHostId,
            workspaceName: primary.name,
            projectName: project.name
          })
        }
      >
        <FolderTree aria-hidden />
        {translate('research.navigation.adopt', 'Organize with agent in background')}
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={onSlack}>
        <MessageSquare aria-hidden />
        Slack connection…
      </DropdownMenuItem>
      {repo || project.projectGroupId ? (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => {
              if (repo) {
                useAppStore.getState().openModal('confirm-remove-folder', {
                  repoId: repo.id,
                  displayName: project.name,
                  hostId: getRepoExecutionHostId(repo)
                })
              } else {
                onRemoveFolderProject()
              }
            }}
          >
            <Trash2 aria-hidden />
            Remove from {PRODUCT_NAME}…
          </DropdownMenuItem>
        </>
      ) : null}
    </>
  )
}
