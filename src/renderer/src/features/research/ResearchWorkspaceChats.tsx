import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { FolderPlus, MessageSquareText, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { QuickLaunchAgentMenuItems } from '@/components/tab-bar/QuickLaunchButton'
import { resolveCliChatResumeSource } from '@/components/tab-bar/cli-chat-resume-source'
import { runCliChatResume, useCliChatResumePending } from '@/components/tab-bar/cli-chat-resume-run'
import { useAppStore } from '@/store'
import { getResolvedExecutionHostIdForWorktree } from '@/lib/resolved-worktree-execution-host'
import { activateAndRevealWorkspace } from '@/lib/worktree-activation'
import {
  canMoveTabToNewPaneColumn,
  moveTabToNewPaneColumn
} from '@/components/tab-bar/tab-move-to-pane-column'
import type { Tab } from '../../../../shared/tab-types'
import type { ExecutionHostId } from '../../../../shared/execution-host'
import { conversationExperiment } from '../../../../shared/research/research-conversation-context'
import { useResearchRecords } from './research-records-store'
import { useResearchLibrary } from './research-library-store'
import { ResearchConversationRow } from './ResearchConversationRow'
import { ResearchDelegationList } from './ResearchDelegationList'
import { linkResearchConversation } from './research-conversation-link'
import { useResearchActiveProject } from './research-home-projects'
import { collectProjectAgentGroups } from './research-project-agent-groups'
import { canCreateResearchWorktree, openResearchNewWorktree } from './research-new-worktree'
import { researchConversationHome } from './research-conversation-home'
import { researchBackgroundTabIsHidden } from './research-background-tab'
import { useResearchSlackBackgroundTasks } from './research-slack-background-tasks'

/** Project conversations remain reachable while a different worktree is active. */
export function ResearchWorkspaceChats(): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false)
  const { project, workspace: activeWorkspace } = useResearchActiveProject()
  const canCreateWorktree = useAppStore((state) =>
    canCreateResearchWorktree(state, activeWorkspace)
  )
  const [chatSettingError, setChatSettingError] = useState(false)
  const [linkError, setLinkError] = useState<string | null>(null)
  const document = useResearchRecords((state) => state.document)
  const slackEntries = useResearchSlackBackgroundTasks((state) => state.entries)
  const slackTasks = slackEntries.map((entry) => entry.delegation)
  const libraryDocument = useResearchLibrary((state) => state.document)
  const chatEnabled = useAppStore((state) => state.settings?.experimentalNativeChat === true)
  const workspaceId = useAppStore((state) => state.activeWorktreeId)
  const onWorkbench = useAppStore((state) => state.activeView === 'terminal')
  const allTabs = useAppStore((state) => state.unifiedTabsByWorktree)
  const terminalTabs = useAppStore((state) => state.tabsByWorktree)
  const groupId = useAppStore((state) =>
    workspaceId
      ? (state.activeGroupIdByWorktree[workspaceId] ?? state.groupsByWorktree[workspaceId]?.[0]?.id)
      : undefined
  )
  const activeTabId = useAppStore((state) => {
    if (!workspaceId) {
      return null
    }
    const groupId = state.activeGroupIdByWorktree[workspaceId]
    return groupId
      ? (state.groupsByWorktree[workspaceId]?.find((group) => group.id === groupId)?.activeTabId ??
          null)
      : null
  })
  const resumableTerminal = useAppStore(
    useShallow((state) => {
      if (!workspaceId || !activeTabId) {
        return null
      }
      return resolveCliChatResumeSource(state, {
        tab: { id: activeTabId, worktreeId: workspaceId }
      })
    })
  )
  const resumePending = useCliChatResumePending(resumableTerminal)
  const projectAgentGroups = collectProjectAgentGroups(
    project?.workspaces ??
      (workspaceId
        ? [
            {
              id: workspaceId,
              name: activeWorkspace?.name ?? 'Current workspace',
              branch: activeWorkspace?.branch ?? null,
              executionHostId: activeWorkspace?.executionHostId,
              isMain: activeWorkspace?.isMain ?? false
            }
          ]
        : []),
    allTabs,
    terminalTabs,
    (id) => getResolvedExecutionHostIdForWorktree(useAppStore.getState(), id)
  )
  const workbenchGroups = projectAgentGroups.map((group) => ({
    ...group,
    tabs: group.tabs.filter(
      (tab) =>
        !researchBackgroundTabIsHidden(document, tab, group.hostId, slackTasks) &&
        (tab.contentType !== 'agent-session' ||
          researchConversationHome(
            document,
            libraryDocument,
            group.hostId,
            group.workspace.id,
            tab.entityId
          ).kind === 'workbench')
    )
  }))
  async function linkConversation(
    tab: Tab,
    tabHostId: string | null,
    experimentId: string | null
  ): Promise<void> {
    if (!tabHostId) {
      return
    }
    try {
      await linkResearchConversation(
        { tabId: tab.id, workspaceId: tab.worktreeId, hostId: tabHostId },
        experimentId
      )
      setLinkError(null)
    } catch (cause) {
      setLinkError(`Experiment link was not saved. ${String(cause)}`)
    }
  }

  function activateConversation(tab: Tab, host: ExecutionHostId | null): boolean {
    const owner = tab.executionHostId ?? host
    if (
      activateAndRevealWorkspace(tab.worktreeId, owner ? { executionHostId: owner } : undefined) ===
      false
    ) {
      setLinkError('This agent workspace is unavailable. Its session was not removed.')
      return false
    }
    useAppStore.getState().activateTab(tab.id, { worktreeId: tab.worktreeId })
    setLinkError(null)
    return true
  }

  function showInSeparatePane(tab: Tab, host: ExecutionHostId | null): void {
    if (!activateConversation(tab, host)) {
      return
    }
    if (
      !moveTabToNewPaneColumn({ unifiedTabId: tab.id, groupId: tab.groupId, direction: 'right' })
    ) {
      setLinkError('This agent could not be moved into a separate pane.')
    }
  }

  useEffect(() => {
    void useResearchRecords.getState().load()
    void useResearchLibrary.getState().load()
  }, [])

  useEffect(() => {
    if (!project) {
      return
    }
    const refresh = (): void => {
      void useResearchSlackBackgroundTasks
        .getState()
        .refresh(project)
        .catch(() => {})
    }
    refresh()
    const timer = setInterval(refresh, 5_000)
    return () => clearInterval(timer)
  }, [project])

  useEffect(() => {
    if (chatEnabled) {
      setChatSettingError(false)
      return
    }
    let active = true
    void useAppStore
      .getState()
      .updateSettingsOrThrow({ experimentalNativeChat: true })
      .catch(() => {
        if (active) {
          setChatSettingError(true)
        }
      })
    return () => {
      active = false
    }
  }, [chatEnabled])

  return (
    <section className="space-y-2 py-1" aria-label="Conversations">
      {workspaceId && groupId ? (
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen} modal={false}>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="w-full justify-start">
              <Plus className="size-4" aria-hidden />
              New conversation
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72 max-w-[calc(100vw-1rem)]">
            <DropdownMenuLabel
              className="truncate"
              title={[activeWorkspace?.name, activeWorkspace?.branch].filter(Boolean).join(' · ')}
            >
              This workspace · {activeWorkspace?.name ?? 'Current'}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <QuickLaunchAgentMenuItems
              worktreeId={workspaceId}
              groupId={groupId}
              chatOnly
              onFocusChat={(tabId) => {
                useAppStore.getState().activateTab(tabId, { worktreeId: workspaceId })
              }}
              onFocusTerminal={(tabId) => {
                useAppStore.getState().activateTab(tabId, { worktreeId: workspaceId })
              }}
            />
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={!canCreateWorktree || !activeWorkspace}
              onSelect={() => {
                if (activeWorkspace) {
                  openResearchNewWorktree(activeWorkspace)
                }
              }}
            >
              <FolderPlus aria-hidden />
              <span className="min-w-0 flex-1">New isolated copy…</span>
              <span className="text-muted-foreground">
                {canCreateWorktree ? 'Own files' : 'Needs Git'}
              </span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : !workspaceId ? (
        <Button
          size="sm"
          variant="outline"
          className="w-full justify-start"
          onClick={() => useAppStore.getState().openModal('worktree-palette')}
        >
          Choose a workspace
        </Button>
      ) : null}
      {chatSettingError ? (
        <p role="alert" className="px-2 text-xs text-destructive">
          Chat setting was not saved. Try again in Settings.
        </p>
      ) : null}
      {linkError && (
        <p role="alert" className="px-2 text-xs text-destructive">
          {linkError}
        </p>
      )}
      {resumableTerminal ? (
        <Button
          size="sm"
          variant="secondary"
          className="w-full justify-start"
          disabled={resumePending}
          aria-busy={resumePending || undefined}
          onClick={() => void runCliChatResume(resumableTerminal, true)}
        >
          <MessageSquareText className="size-4" aria-hidden />
          Continue current session in chat
        </Button>
      ) : null}
      <div className="space-y-3">
        {workbenchGroups
          .filter((group) => group.tabs.length > 0 || group.workspace.id === workspaceId)
          .map((group) => {
            const { workspace, hostId: groupHostId } = group
            const workspaceExperiments =
              document?.experiments.filter(
                (experiment) =>
                  experiment.workspaceId === workspace.id && experiment.hostId === groupHostId
              ) ?? []
            const experiments = workspaceExperiments.filter((experiment) => !experiment.archived)
            return (
              <div key={JSON.stringify([workspace.id, groupHostId])} className="space-y-1">
                <Button
                  size="xs"
                  variant="ghost"
                  className="w-full justify-start text-2xs font-semibold text-muted-foreground"
                  title={[workspace.name, workspace.branch].filter(Boolean).join(' · ')}
                  onClick={() =>
                    activateAndRevealWorkspace(
                      workspace.id,
                      groupHostId ? { executionHostId: groupHostId } : undefined
                    )
                  }
                >
                  <span className="min-w-0 flex-1 truncate text-left">
                    {workspace.id === workspaceId ? 'This workspace' : workspace.name}
                  </span>
                  <span
                    className="shrink-0 font-normal tabular-nums"
                    aria-label={`${group.tabs.length} conversations`}
                  >
                    {group.tabs.length}
                  </span>
                </Button>
                {group.tabs.map((tab) => {
                  const linkable = tab.contentType === 'agent-session' || tab.viewMode === 'chat'
                  const contextLabel =
                    tab.contentType === 'terminal' && tab.viewMode !== 'chat'
                      ? 'Agent terminal'
                      : undefined
                  return (
                    <ResearchConversationRow
                      key={tab.id}
                      tab={tab}
                      hostId={groupHostId}
                      // Why: only the Workbench page makes a conversation the current row.
                      active={onWorkbench && workspace.id === workspaceId && activeTabId === tab.id}
                      contextLabel={contextLabel}
                      linkedExperiment={
                        document && linkable
                          ? conversationExperiment(
                              document,
                              tab.id,
                              workspace.id,
                              groupHostId,
                              tab.entityId
                            )
                          : null
                      }
                      experiments={experiments}
                      onSelect={() => void activateConversation(tab, groupHostId)}
                      onLink={
                        linkable
                          ? (experimentId) => void linkConversation(tab, groupHostId, experimentId)
                          : undefined
                      }
                      onSplit={
                        canMoveTabToNewPaneColumn(tab.id, tab.groupId)
                          ? () => showInSeparatePane(tab, groupHostId)
                          : undefined
                      }
                    />
                  )
                })}
              </div>
            )
          })}
      </div>
      <ResearchDelegationList
        workspaceScopes={projectAgentGroups.map((group) => ({
          workspaceId: group.workspace.id,
          hostId: group.hostId
        }))}
      />
    </section>
  )
}
