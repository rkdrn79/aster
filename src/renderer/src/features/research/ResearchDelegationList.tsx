import { useState } from 'react'
import { ArrowUpRight, EyeOff, Send, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store'
import { parseExecutionHostId } from '../../../../shared/execution-host'
import type { ResearchDelegationRecord } from '../../../../shared/research/research-records'
import type { Tab } from '../../../../shared/tab-types'
import { formatAgentTypeLabel } from '../../../../shared/agent-type-label'
import { enterResearchWorkspace } from './research-navigation'
import { useResearchRecords } from './research-records-store'
import { updateResearchDelegation } from './research-delegation-launch'
import { researchDelegationDismissible } from './research-delegation-lifecycle'
import { dismissResearchDelegations } from './research-delegation-dismissals'
import {
  useResearchDelegationRows,
  type ResearchDelegationRow
} from './use-research-delegation-rows'

async function openDelegationTab(
  delegation: ResearchDelegationRecord,
  tab: Tab | undefined
): Promise<void> {
  const host = parseExecutionHostId(delegation.targetHostId)
  if (!host || !tab) {
    return
  }
  if (delegation.workbenchVisible !== true) {
    await updateResearchDelegation(delegation.id, { workbenchVisible: true })
  }
  enterResearchWorkspace({ id: delegation.targetWorkspaceId, executionHostId: host.id })
  const state = useAppStore.getState()
  state.setActiveView('terminal')
  state.activateTab(tab.id, { worktreeId: delegation.targetWorkspaceId })
}

function DelegationRow({
  row,
  history = false
}: {
  row: ResearchDelegationRow
  history?: boolean
}): React.JSX.Element {
  const { delegation, tab, status, reachable, activity } = row
  const latestMessage = status?.lastAssistantMessage ?? status?.lastCompletedAssistantMessage

  return (
    <div className="min-w-0 rounded-md border border-worktree-sidebar-border px-2 py-1.5 text-xs">
      <div className="flex items-start gap-1">
        <Send className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium" title={delegation.task}>
            {delegation.task}
          </p>
          <p className="truncate text-muted-foreground" title={delegation.targetLabel}>
            <span role="status">{activity.label}</span> · {formatAgentTypeLabel(delegation.agent)}{' '}
            on {delegation.targetLabel}
          </p>
          {reachable && status?.toolName && status.state === 'working' ? (
            <p className="truncate text-muted-foreground">Using {status.toolName}</p>
          ) : null}
          {reachable && latestMessage ? (
            <p className="line-clamp-2 text-muted-foreground" title={latestMessage}>
              {latestMessage}
            </p>
          ) : null}
          {status ? (
            <p className="text-3xs text-muted-foreground">
              Last observed{' '}
              {new Date(status.evidenceObservedAt ?? status.updatedAt).toLocaleString()}
            </p>
          ) : null}
        </div>
        {!history && researchDelegationDismissible(activity.phase) ? (
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label={`Dismiss ${delegation.task}`}
            title="Dismiss"
            onClick={() => dismissResearchDelegations([delegation.id])}
          >
            <X aria-hidden />
          </Button>
        ) : null}
        {delegation.workbenchVisible ? (
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label={`Return ${delegation.task} to Background tasks`}
            title="Hide from Workbench"
            onClick={() =>
              void updateResearchDelegation(delegation.id, { workbenchVisible: false }).catch(
                (cause) => toast.error(`Task placement was not saved: ${String(cause)}`)
              )
            }
          >
            <EyeOff aria-hidden />
          </Button>
        ) : null}
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label={`Open ${delegation.task} in Workbench`}
          title={tab ? 'Open in Workbench' : 'Agent tab unavailable'}
          disabled={!tab}
          onClick={() =>
            void openDelegationTab(delegation, tab).catch((cause) =>
              toast.error(`Task could not be opened: ${String(cause)}`)
            )
          }
        >
          <ArrowUpRight aria-hidden />
        </Button>
      </div>
    </div>
  )
}

/**
 * Delegated background tasks still in play: running, waiting on the user, or failed. A finished
 * one reads "Done" briefly and then leaves; `showHistory` keeps finished ones one click away.
 */
export function ResearchDelegationList({
  workspaceScopes,
  showAllInitially = false,
  showEmpty = false,
  showHistory = false
}: {
  workspaceScopes?: readonly { workspaceId: string; hostId: string | null }[]
  showAllInitially?: boolean
  showEmpty?: boolean
  showHistory?: boolean
}): React.JSX.Element | null {
  const [showAll, setShowAll] = useState(showAllInitially)
  const [historyOpen, setHistoryOpen] = useState(false)
  const document = useResearchRecords((state) => state.document)
  const delegations =
    document?.delegations?.filter(
      (entry) =>
        !workspaceScopes ||
        workspaceScopes.some(
          (scope) =>
            entry.sourceWorkspaceId === scope.workspaceId && entry.sourceHostId === scope.hostId
        )
    ) ?? []
  const rows = useResearchDelegationRows(delegations)
  const live = rows.filter((row) => row.live)
  const history = rows.filter((row) => !row.live)
  const failed = live.filter((row) => row.activity.phase === 'failed')
  const hasHistory = showHistory && history.length > 0
  if (!live.length && !showEmpty && !hasHistory) {
    return null
  }
  return (
    <section
      className="space-y-1 border-t border-worktree-sidebar-border pt-3"
      aria-label="Background agent tasks"
    >
      <p className="px-2 text-2xs font-semibold uppercase tracking-widest text-muted-foreground">
        Background agent tasks
      </p>
      {live.length === 0 ? (
        <p className="px-2 text-xs text-muted-foreground">
          {rows.length ? 'Nothing running in the background.' : 'No delegated tasks yet.'}
        </p>
      ) : null}
      {(showAll ? live : live.slice(0, 5)).map((row) => (
        <DelegationRow key={row.delegation.id} row={row} />
      ))}
      {live.length > 5 || failed.length > 1 || hasHistory ? (
        <div className="flex flex-wrap gap-1">
          {live.length > 5 ? (
            <Button size="xs" variant="ghost" onClick={() => setShowAll((current) => !current)}>
              {showAll ? 'Show recent' : `Show all ${live.length}`}
            </Button>
          ) : null}
          {failed.length > 1 ? (
            <Button
              size="xs"
              variant="ghost"
              onClick={() => dismissResearchDelegations(failed.map((row) => row.delegation.id))}
            >
              Clear failed
            </Button>
          ) : null}
          {hasHistory ? (
            <Button
              size="xs"
              variant="ghost"
              aria-expanded={historyOpen}
              onClick={() => setHistoryOpen((current) => !current)}
            >
              {historyOpen ? 'Hide finished' : `Show finished (${history.length})`}
            </Button>
          ) : null}
        </div>
      ) : null}
      {hasHistory && historyOpen
        ? history.map((row) => <DelegationRow key={row.delegation.id} row={row} history />)
        : null}
    </section>
  )
}
