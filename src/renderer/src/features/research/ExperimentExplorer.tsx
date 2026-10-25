import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useShallow } from 'zustand/react/shallow'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAppStore } from '@/store'
import { selectResearchWorkspaceContext } from './research-workspace-context'
import { useResearchRecords } from './research-records-store'
import { createBrowserUuid } from '@/lib/browser-uuid'
import { selectResearchExperiment } from '../../../../shared/research/research-selection'
import { createCatalogExperiment } from './research-experiment-catalog-import'
import { ResearchExperimentList } from './ResearchExperimentList'
import { ResearchExperimentActions } from './ResearchExperimentActions'
import { openResearchView } from './research-navigation'
import { experimentSwitchPage, openResearchExperimentPage } from './research-experiment-page'
import { useExperimentChatPanel } from './research-experiment-agent-chat'
import { researchConversationHome } from './research-conversation-home'
import { useResearchLibrary } from './research-library-store'
import { requestWritingAgentFocus } from './research-writing-agent-focus'
import { useCatalogExperimentSync } from './use-catalog-experiment-sync'
import { researchErrorText } from './research-error-text'
import { linkResearchConversation } from './research-conversation-link'
import type { ResearchConversationDrag } from './research-conversation-drag'
import type { Tab } from '../../../../shared/tab-types'
import type {
  ExperimentRecord,
  ResearchRunRecord
} from '../../../../shared/research/research-records'
import { selectResearchExperimentRecord } from './research-experiment-select'
import { useResearchExperimentSidebarStatus } from './use-research-experiment-sidebar-status'
import { groupExperimentConversations } from './research-experiment-conversations'

const NO_TABS: Tab[] = []
const NO_RUNS: ResearchRunRecord[] = []

export function ExperimentExplorer({
  actionsHost,
  expanded,
  onExpand
}: {
  actionsHost: HTMLElement | null
  expanded: boolean
  onExpand: () => void
}): React.JSX.Element {
  const context = useAppStore(useShallow(selectResearchWorkspaceContext))
  const tabs = useAppStore((state) =>
    context.workspaceId ? (state.unifiedTabsByWorktree[context.workspaceId] ?? NO_TABS) : NO_TABS
  )
  const document = useResearchRecords((state) => state.document)
  const loading = useResearchRecords((state) => state.loading)
  const saving = useResearchRecords((state) => state.saving)
  const error = useResearchRecords((state) => state.error)
  const [name, setName] = useState('')
  const [adding, setAdding] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [query, setQuery] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [actionOwner, setActionOwner] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const lastWorkspaceScope = useRef<string | null>(null)
  const renameSettled = useRef(false)
  const activeView = useAppStore((state) => state.activeView)
  const scopeKey =
    context.hostId && context.workspaceId
      ? JSON.stringify([context.hostId, context.workspaceId])
      : null
  const workspaceIdentity = JSON.stringify([
    context.hostId,
    context.workspaceId,
    context.workspacePath
  ])
  const scopedExperiments =
    document?.experiments.filter(
      (experiment) =>
        experiment.hostId === context.hostId && experiment.workspaceId === context.workspaceId
    ) ?? []
  const statuses = useResearchExperimentSidebarStatus(
    scopedExperiments,
    document?.runs ?? NO_RUNS,
    expanded
  )
  const conversationsByExperiment = useMemo(
    () => groupExperimentConversations(document, tabs, context.workspaceId, context.hostId),
    [document, tabs, context.workspaceId, context.hostId]
  )

  useEffect(() => {
    void useResearchRecords.getState().load()
  }, [])
  const catalogSyncIssue = useCatalogExperimentSync(context, Boolean(document))

  useEffect(() => {
    if (!document || !scopeKey || lastWorkspaceScope.current === scopeKey) {
      return
    }
    lastWorkspaceScope.current = scopeKey
    void useResearchRecords
      .getState()
      .update((current) => {
        const active = selectResearchWorkspaceContext(useAppStore.getState())
        if (JSON.stringify([active.hostId, active.workspaceId]) !== scopeKey) {
          return current
        }
        const previous = current.experiments.find(
          (experiment) => experiment.id === current.selectedExperimentId
        )
        const saved = { ...current.selectedExperimentByWorkspace }
        if (previous) {
          saved[JSON.stringify([previous.hostId, previous.workspaceId])] = previous.id
        }
        const selected =
          current.experiments.find(
            (experiment) =>
              experiment.id === saved[scopeKey] &&
              experiment.hostId === active.hostId &&
              experiment.workspaceId === active.workspaceId
          ) ??
          current.experiments.find(
            (experiment) =>
              experiment.hostId === active.hostId &&
              experiment.workspaceId === active.workspaceId &&
              !experiment.archived
          )
        if (selected) {
          saved[scopeKey] = selected.id
          return selectResearchExperiment(
            { ...current, selectedExperimentByWorkspace: saved },
            selected.id
          )
        }
        delete saved[scopeKey]
        return {
          ...current,
          selectedExperimentByWorkspace: saved,
          selectedExperimentId: null,
          selectedRunId: null
        }
      })
      .catch(() => {
        // The store keeps the save failure visible.
      })
  }, [document, scopeKey])

  async function create(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    const { workspaceId, workspacePath, hostId } = context
    if (!name.trim() || !workspaceId || !workspacePath || !hostId) {
      return
    }
    if (hostId === 'local') {
      setCreating(true)
      setActionError(null)
      setActionOwner(workspaceIdentity)
      try {
        await createCatalogExperiment(context, name.trim())
        setName('')
        setAdding(false)
      } catch (cause) {
        setActionError(`Could not create the experiment. ${researchErrorText(cause)}`)
      } finally {
        setCreating(false)
      }
      return
    }
    const now = new Date().toISOString()
    const experiment = {
      id: createBrowserUuid(),
      name: name.trim(),
      projectId: context.projectId,
      workspaceId,
      workspacePath,
      hostId,
      archived: false,
      createdAt: now,
      updatedAt: now
    }
    try {
      await useResearchRecords.getState().update((current) => ({
        ...current,
        experiments: [...current.experiments, experiment],
        selectedExperimentByWorkspace: {
          ...current.selectedExperimentByWorkspace,
          [JSON.stringify([experiment.hostId, experiment.workspaceId])]: experiment.id
        },
        selectedExperimentId: experiment.id,
        selectedRunId: null
      }))
      setName('')
      setAdding(false)
    } catch {
      // The store keeps the save failure visible.
    }
  }

  async function select(id: string): Promise<void> {
    try {
      await selectResearchExperimentRecord(id)
    } catch {
      // The store keeps the save failure visible.
    }
  }

  async function archive(target: ExperimentRecord): Promise<void> {
    const { id } = target
    const wasSelected = useResearchRecords.getState().document?.selectedExperimentId === id
    try {
      await useResearchRecords.getState().update((current) => ({
        ...current,
        experiments: current.experiments.map((experiment) =>
          experiment.id === id
            ? { ...experiment, archived: !experiment.archived, updatedAt: new Date().toISOString() }
            : experiment
        ),
        selectedExperimentByWorkspace: Object.fromEntries(
          Object.entries(current.selectedExperimentByWorkspace).filter(
            ([, selectedId]) => selectedId !== id
          )
        ),
        selectedExperimentId:
          current.selectedExperimentId === id ? null : current.selectedExperimentId,
        selectedRunId: current.selectedExperimentId === id ? null : current.selectedRunId
      }))
    } catch {
      // The store keeps the save failure visible.
      return
    }
    if (!target.archived) {
      // Why: archive sits one click from rename, so it must be one click to take back.
      toast(`Archived ${target.name}`, {
        action: {
          label: 'Undo',
          onClick: () =>
            void archive({ ...target, archived: true }).then(() =>
              wasSelected ? select(id) : undefined
            )
        }
      })
    }
  }

  function startRename(experiment: ExperimentRecord): void {
    renameSettled.current = false
    setRenamingId(experiment.id)
    setRenameValue(experiment.name)
  }

  function cancelRename(): void {
    renameSettled.current = true
    setRenamingId(null)
  }

  /** Enter and blur both land here; the first one wins and an unchanged name saves nothing. */
  async function commitRename(): Promise<void> {
    const id = renamingId
    const name = renameValue.trim()
    if (renameSettled.current || !id) {
      return
    }
    renameSettled.current = true
    setRenamingId(null)
    if (!name || name === scopedExperiments.find((entry) => entry.id === id)?.name) {
      return
    }
    try {
      await useResearchRecords.getState().update((current) => ({
        ...current,
        experiments: current.experiments.map((entry) =>
          entry.id === id ? { ...entry, name, updatedAt: new Date().toISOString() } : entry
        )
      }))
    } catch {
      // The store keeps the save failure visible.
    }
  }

  /** A docked chat opens beside its notebook, a Writing chat in Writing, others in Workbench. */
  function openConversation(tab: Tab): void {
    const home = researchConversationHome(
      useResearchRecords.getState().document,
      useResearchLibrary.getState().document,
      context.hostId,
      tab.worktreeId,
      tab.entityId
    )
    if (home.kind === 'experiment') {
      useExperimentChatPanel.getState().setOpen(home.experimentId, true)
      openResearchExperimentPage(home.experimentId, 'notebook')
    } else if (home.kind === 'writing') {
      requestWritingAgentFocus(home.experimentId)
      openResearchView('research-writing')
    } else {
      const state = useAppStore.getState()
      state.setActiveView('terminal')
      state.activateTab(tab.id, { worktreeId: tab.worktreeId })
    }
  }

  async function linkConversation(
    source: ResearchConversationDrag,
    experimentId: string
  ): Promise<void> {
    try {
      await linkResearchConversation(source, experimentId)
      setActionError(null)
    } catch (cause) {
      setActionOwner(workspaceIdentity)
      setActionError(`Could not link the conversation. ${researchErrorText(cause)}`)
    }
  }

  return (
    <section className="space-y-2 py-1" aria-label="Experiment list">
      <ResearchExperimentActions
        actionsHost={actionsHost}
        workspaceId={context.workspaceId}
        hasArchived={scopedExperiments.some((experiment) => experiment.archived)}
        showArchived={showArchived}
        onShowArchivedChange={setShowArchived}
        onCreate={() => {
          if (!expanded) {
            onExpand()
            setAdding(true)
          } else {
            setAdding((value) => !value)
          }
        }}
      />
      {(actionOwner === workspaceIdentity && actionError) || catalogSyncIssue ? (
        <p role="alert" className="px-2 text-xs text-destructive">
          {actionOwner === workspaceIdentity && actionError ? actionError : catalogSyncIssue}
        </p>
      ) : null}
      {adding ? (
        <form onSubmit={(event) => void create(event)} className="space-y-2 px-2">
          <Input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Experiment name"
            aria-label="Experiment name"
            maxLength={120}
          />
          <Button
            size="xs"
            type="submit"
            disabled={saving || creating || !name.trim() || !context.workspaceId}
          >
            Create
          </Button>
        </form>
      ) : null}
      <ResearchExperimentList
        experiments={scopedExperiments}
        selectedExperimentId={document?.selectedExperimentId ?? null}
        experimentOpen={activeView === 'research-runs' || activeView === 'research-compare'}
        statuses={statuses}
        hasDocument={Boolean(document)}
        loading={loading}
        workspaceId={context.workspaceId}
        query={query}
        onQueryChange={setQuery}
        showArchived={showArchived}
        renamingId={renamingId}
        renameValue={renameValue}
        onRenameValueChange={setRenameValue}
        onRenameStart={startRename}
        onRenameCommit={() => void commitRename()}
        onRenameCancel={cancelRename}
        onSelect={(id) => {
          const page = experimentSwitchPage()
          void select(id).then(() => openResearchExperimentPage(id, page))
        }}
        onArchive={(experiment) => void archive(experiment)}
        onLinkConversation={(source, experimentId) => void linkConversation(source, experimentId)}
        conversationsByExperiment={conversationsByExperiment}
        onOpenConversation={openConversation}
      />
      {error ? (
        <p role="alert" className="px-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  )
}
