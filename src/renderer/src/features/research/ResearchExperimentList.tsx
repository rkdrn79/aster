import { useState } from 'react'
import { Archive, MessageSquareText, Pencil } from 'lucide-react'
import type { ExperimentRecord } from '../../../../shared/research/research-records'
import type { Tab } from '../../../../shared/tab-types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  readResearchConversationDrag,
  RESEARCH_CONVERSATION_DRAG_TYPE,
  type ResearchConversationDrag
} from './research-conversation-drag'
import type { ExperimentSidebarStatus } from './use-research-experiment-sidebar-status'

type Props = {
  experiments: ExperimentRecord[]
  selectedExperimentId: string | null
  /** An Experiment screen is open, so the selected row is the current page. */
  experimentOpen: boolean
  statuses: ReadonlyMap<string, ExperimentSidebarStatus>
  hasDocument: boolean
  loading: boolean
  workspaceId: string | null
  query: string
  onQueryChange: (value: string) => void
  showArchived: boolean
  renamingId: string | null
  renameValue: string
  onRenameValueChange: (value: string) => void
  onRenameStart: (experiment: ExperimentRecord) => void
  /** Enter or leaving the field saves; Esc cancels. */
  onRenameCommit: () => void
  onRenameCancel: () => void
  /** Selects the Experiment and opens its notebook. */
  onSelect: (id: string) => void
  onArchive: (experiment: ExperimentRecord) => void
  onLinkConversation: (source: ResearchConversationDrag, experimentId: string) => void
  conversationsByExperiment: Map<string, Tab[]>
  onOpenConversation: (tab: Tab) => void
}

const STATUS_DOT: Record<NonNullable<ExperimentSidebarStatus['state']>, string> = {
  failed: 'bg-destructive',
  'needs-you': 'bg-status-warning',
  running: 'bg-status-success'
}

const STATUS_TEXT: Record<NonNullable<ExperimentSidebarStatus['state']>, string> = {
  failed: 'Failed run',
  'needs-you': 'Needs you',
  running: 'Running'
}

function statusText(status: ExperimentSidebarStatus | undefined): string | null {
  if (!status?.state) {
    return null
  }
  return status.needsYou > 0 && status.state !== 'running'
    ? `${STATUS_TEXT[status.state]} · ${status.needsYou} need you`
    : STATUS_TEXT[status.state]
}

export function ResearchExperimentList({
  experiments,
  selectedExperimentId,
  experimentOpen,
  statuses,
  hasDocument,
  loading,
  workspaceId,
  query,
  onQueryChange,
  showArchived,
  renamingId,
  renameValue,
  onRenameValueChange,
  onRenameStart,
  onRenameCommit,
  onRenameCancel,
  onSelect,
  onArchive,
  onLinkConversation,
  conversationsByExperiment,
  onOpenConversation
}: Props): React.JSX.Element {
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  return (
    <>
      {experiments.length > 5 && (
        <Input
          density="compact"
          className="mx-2 w-[calc(100%-1rem)]"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Find experiments"
          aria-label="Find experiments"
        />
      )}
      {experiments
        .filter(
          (experiment) =>
            (showArchived || !experiment.archived || selectedExperimentId === experiment.id) &&
            experiment.name.toLowerCase().includes(query.toLowerCase())
        )
        .map((experiment) => {
          const selected = selectedExperimentId === experiment.id
          const current = selected && experimentOpen
          const status = statuses.get(experiment.id)
          const described = statusText(status)
          const conversations = conversationsByExperiment.get(experiment.id)?.length ?? 0
          return (
            <div key={experiment.id} className="group flex min-w-0 flex-col px-1">
              {renamingId === experiment.id ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault()
                    onRenameCommit()
                  }}
                >
                  <Input
                    value={renameValue}
                    onChange={(event) => onRenameValueChange(event.target.value)}
                    onFocus={(event) => event.currentTarget.select()}
                    onBlur={onRenameCommit}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        event.preventDefault()
                        event.stopPropagation()
                        onRenameCancel()
                      }
                    }}
                    aria-label={`Rename ${experiment.name}`}
                    maxLength={120}
                    autoFocus
                  />
                </form>
              ) : (
                <div
                  className={cn(
                    'relative flex min-w-0 items-center rounded-md',
                    dropTargetId === experiment.id && 'ring-2 ring-ring'
                  )}
                >
                  {/* Why: one current row; the selected Experiment elsewhere keeps only a faint tick. */}
                  {selected && !current ? (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-y-2 left-0 w-0.5 rounded-full bg-muted-foreground/60"
                    />
                  ) : null}
                  <Button
                    size="sm"
                    variant={current ? 'secondary' : 'ghost'}
                    className="min-w-0 flex-1 justify-start"
                    data-current={current || undefined}
                    data-selected={selected || undefined}
                    data-conversation-drop-target={dropTargetId === experiment.id || undefined}
                    // Why: status rides in the description so the row's name stays the Experiment's.
                    title={described ? `${experiment.name} · ${described}` : experiment.name}
                    onDragOver={(event) => {
                      if (
                        !Array.from(event.dataTransfer.types).includes(
                          RESEARCH_CONVERSATION_DRAG_TYPE
                        )
                      ) {
                        return
                      }
                      event.preventDefault()
                      event.dataTransfer.dropEffect = 'link'
                      setDropTargetId(experiment.id)
                    }}
                    onDragLeave={() => setDropTargetId(null)}
                    onDrop={(event) => {
                      event.preventDefault()
                      setDropTargetId(null)
                      const source = readResearchConversationDrag(event.dataTransfer)
                      if (source) {
                        onLinkConversation(source, experiment.id)
                      }
                    }}
                    aria-current={current ? 'page' : undefined}
                    onClick={() => onSelect(experiment.id)}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'size-1.5 shrink-0 rounded-full',
                        status?.state ? STATUS_DOT[status.state] : 'invisible'
                      )}
                    />
                    <span className="truncate">{experiment.name}</span>
                    {status && status.needsYou > 0 ? (
                      <span
                        aria-hidden
                        className="ml-auto shrink-0 rounded-sm border border-worktree-sidebar-border px-1 text-2xs tabular-nums text-muted-foreground"
                      >
                        {status.needsYou}
                      </span>
                    ) : !selected && conversations > 0 ? (
                      <span className="ml-auto flex items-center gap-1 text-2xs text-muted-foreground">
                        <MessageSquareText className="size-3" aria-hidden />
                        {conversations}
                      </span>
                    ) : null}
                  </Button>
                  {/* Why: row actions take room only on hover or focus, so names keep the width. */}
                  <span className="flex w-0 overflow-hidden opacity-0 group-hover:w-auto group-hover:opacity-100 focus-within:w-auto focus-within:opacity-100">
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label={`Rename ${experiment.name}`}
                      title="Rename"
                      onClick={() => onRenameStart(experiment)}
                    >
                      <Pencil aria-hidden />
                    </Button>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label={`${experiment.archived ? 'Restore' : 'Archive'} ${experiment.name}`}
                      title={experiment.archived ? 'Restore' : 'Archive'}
                      onClick={() => onArchive(experiment)}
                    >
                      <Archive aria-hidden />
                    </Button>
                  </span>
                </div>
              )}
              {selected && conversations > 0 ? (
                <div
                  aria-label={`${experiment.name} chats`}
                  className="ml-3 space-y-0.5 border-l border-worktree-sidebar-border pl-2"
                >
                  {(conversationsByExperiment.get(experiment.id) ?? []).map((tab) => (
                    <Button
                      key={tab.id}
                      size="sm"
                      variant="ghost"
                      className="w-full justify-start"
                      title={tab.customLabel ?? tab.aiVaultTitle?.title ?? tab.label}
                      onClick={() => onOpenConversation(tab)}
                    >
                      <MessageSquareText aria-hidden />
                      <span className="truncate">
                        {tab.customLabel ?? tab.aiVaultTitle?.title ?? tab.label}
                      </span>
                    </Button>
                  ))}
                </div>
              ) : null}
            </div>
          )
        })}
      {(!hasDocument || experiments.length === 0) && (
        <p className="px-2 text-xs text-muted-foreground">
          {!hasDocument && loading
            ? 'Loading experiments…'
            : workspaceId
              ? 'Create an experiment for this workspace.'
              : 'Select a workspace to start an experiment.'}
        </p>
      )}
    </>
  )
}
