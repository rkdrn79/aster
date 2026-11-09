import { useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { ChevronDown, CloudDownload, MessageSquareReply, PanelRight, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useAppStore } from '@/store'
import { cn } from '@/lib/utils'
import { ResearchEmptyState, ResearchPageBody, ResearchPageHeader } from './ResearchPageLayout'
import { ResearchRebuttalAgentPane } from './ResearchRebuttalAgentPane'
import { ResearchRebuttalAssemble } from './ResearchRebuttalAssemble'
import { ResearchRebuttalClusters } from './ResearchRebuttalClusters'
import { ResearchRebuttalLayout } from './ResearchRebuttalLayout'
import { ResearchRebuttalNewDialog } from './ResearchRebuttalNewDialog'
import { ResearchRebuttalOpenReviewDialog } from './ResearchRebuttalOpenReviewDialog'
import { ResearchRebuttalPromises } from './ResearchRebuttalPromises'
import { ResearchRebuttalReviews } from './ResearchRebuttalReviews'
import {
  consumeRebuttalAgentFocus,
  subscribeRebuttalAgentFocus
} from './research-rebuttal-agent-session'
import { rebuttalOwnerKey, type RebuttalOwner } from './research-rebuttal-files'
import {
  openRebuttalProject,
  selectRebuttal,
  useRebuttalAutoRefresh,
  useResearchRebuttal
} from './research-rebuttal-store'
import { selectResearchWorkspaceContext } from './research-workspace-context'
import { useResearchRebuttalActions } from './use-research-rebuttal-actions'

type CenterTab = 'clusters' | 'assemble' | 'promises'
const AGENT_OPEN_KEY = 'aster.research-rebuttal-agent-open.v1'

function readAgentOpen(): boolean {
  try {
    return localStorage.getItem(AGENT_OPEN_KEY) !== 'false'
  } catch {
    return true
  }
}

function RebuttalWorkspace({ owner }: { owner: RebuttalOwner }): React.JSX.Element {
  const { rebuttals, snapshot, loading, error, selectedSlug } = useResearchRebuttal(
    useShallow((state) => ({
      rebuttals: state.rebuttals,
      snapshot: state.snapshot,
      loading: state.loading,
      error: state.error,
      selectedSlug: state.selectedSlug
    }))
  )
  const [reviewerChoice, setReviewerChoice] = useState<{ slug: string; id: string | null }>()
  const [clusterChoice, setClusterChoice] = useState<{ slug: string; id: string | null }>()
  const [tab, setTab] = useState<CenterTab>('clusters')
  const scope = useMemo(
    () => ({ hostId: owner.hostId, workspaceId: owner.workspaceId }),
    [owner.hostId, owner.workspaceId]
  )
  const [agentOpen, setAgentOpenState] = useState(
    () => consumeRebuttalAgentFocus(scope) || readAgentOpen()
  )
  const [newOpen, setNewOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const setAgentOpen = (open: boolean): void => {
    setAgentOpenState(open)
    try {
      localStorage.setItem(AGENT_OPEN_KEY, String(open))
    } catch {
      // The pane still toggles without storage.
    }
  }
  useEffect(() => {
    void openRebuttalProject(owner)
  }, [owner])
  useRebuttalAutoRefresh(owner, true)
  useEffect(
    () =>
      subscribeRebuttalAgentFocus(() => {
        if (consumeRebuttalAgentFocus(scope)) {
          setAgentOpenState(true)
        }
      }),
    [scope]
  )

  const slug = snapshot?.bundle.meta.slug ?? null
  const reviewers = snapshot?.bundle.meta.reviewers ?? []
  const reviewerId =
    reviewerChoice &&
    reviewerChoice.slug === slug &&
    (reviewerChoice.id === null || reviewers.some((entry) => entry.id === reviewerChoice.id))
      ? reviewerChoice.id
      : (reviewers[0]?.id ?? null)
  const selectedClusterId =
    clusterChoice?.slug === slug &&
    snapshot?.bundle.clusters.some((cluster) => cluster.id === clusterChoice.id)
      ? clusterChoice.id
      : null
  const actions = useResearchRebuttalActions(owner, snapshot, {
    onReviewSaved: (id) => slug && setReviewerChoice({ slug, id }),
    onAgentAsked: () => setAgentOpen(true)
  })
  const readOnly = Boolean(snapshot?.issues.length)

  function selectCluster(clusterId: string | null): void {
    if (!slug || !snapshot) {
      return
    }
    setClusterChoice({ slug, id: clusterId })
    const cluster = snapshot.bundle.clusters.find((entry) => entry.id === clusterId)
    const points = snapshot.bundle.points.filter((point) => cluster?.points.includes(point.id))
    if (points.length && !points.some((point) => point.reviewer === reviewerId)) {
      setReviewerChoice({ slug, id: points[0].reviewer })
    }
  }

  const current = rebuttals.find((entry) => entry.slug === selectedSlug)
  const picker = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="xs" variant="ghost" className="max-w-72">
          <span className="truncate">{current ? current.name : 'No rebuttal'}</span>
          <ChevronDown aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56">
        {rebuttals.map((entry) => (
          <DropdownMenuItem
            key={entry.slug}
            onSelect={() => void selectRebuttal(owner, entry.slug)}
          >
            <span className="min-w-0 flex-1 truncate">{entry.name}</span>
            {entry.venue ? (
              <span className="text-xs text-muted-foreground">{entry.venue}</span>
            ) : null}
          </DropdownMenuItem>
        ))}
        {rebuttals.length ? <DropdownMenuSeparator /> : null}
        <DropdownMenuItem onSelect={() => setNewOpen(true)}>
          <Plus aria-hidden /> New rebuttal…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
  const tabs: { id: CenterTab; label: string; count?: number }[] = [
    { id: 'clusters', label: 'Clusters', count: snapshot?.bundle.clusters.length },
    { id: 'assemble', label: 'Assemble' },
    { id: 'promises', label: 'Promises', count: snapshot?.bundle.promises.length }
  ]

  return (
    <section
      aria-label="Rebuttal"
      className="flex min-h-0 flex-1 flex-col bg-background text-foreground"
    >
      <ResearchPageHeader
        title="Rebuttal"
        context={picker}
        actions={
          <>
            {snapshot ? (
              <Button size="xs" variant="outline" onClick={() => setImportOpen(true)}>
                <CloudDownload aria-hidden /> Import from OpenReview
              </Button>
            ) : null}
            <Button
              size="xs"
              variant={agentOpen ? 'secondary' : 'ghost'}
              aria-pressed={agentOpen}
              onClick={() => setAgentOpen(!agentOpen)}
            >
              <PanelRight aria-hidden /> Agent
            </Button>
          </>
        }
      />
      {error ? (
        <p role="alert" className="border-b border-border px-6 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}
      {snapshot?.issues.length ? (
        <div role="alert" className="border-b border-border px-6 py-2 text-xs text-status-warning">
          Read-only until these files validate (ask the agent to fix them):{' '}
          {snapshot.issues.join(' · ')}
        </div>
      ) : null}
      {snapshot ? (
        <ResearchRebuttalLayout
          agentOpen={agentOpen}
          reviews={
            <ResearchRebuttalReviews
              snapshot={snapshot}
              readOnly={readOnly}
              reviewerId={reviewerId}
              onReviewerChange={(id) => slug && setReviewerChoice({ slug, id })}
              selectedClusterId={selectedClusterId}
              onSelectCluster={selectCluster}
              onSaveReview={actions.saveReview}
            />
          }
          center={
            <>
              <div
                role="tablist"
                aria-label="Rebuttal views"
                className="flex shrink-0 items-center gap-1 border-b border-border px-3 py-1.5"
              >
                {tabs.map((entry) => (
                  <Button
                    key={entry.id}
                    role="tab"
                    aria-selected={tab === entry.id}
                    size="xs"
                    variant={tab === entry.id ? 'secondary' : 'ghost'}
                    onClick={() => setTab(entry.id)}
                  >
                    {entry.label}
                    {entry.count ? (
                      <span className="text-3xs text-muted-foreground tabular-nums">
                        {entry.count}
                      </span>
                    ) : null}
                  </Button>
                ))}
              </div>
              <div className={cn('scrollbar-sleek min-h-0 flex-1 overflow-auto')}>
                {tab === 'clusters' ? (
                  <ResearchRebuttalClusters
                    snapshot={snapshot}
                    readOnly={readOnly}
                    selectedClusterId={selectedClusterId}
                    onSelectCluster={selectCluster}
                    linksFor={actions.linksFor}
                    onChangeCluster={actions.changeCluster}
                    onAgentRequest={actions.askAgent}
                  />
                ) : tab === 'assemble' ? (
                  <ResearchRebuttalAssemble
                    snapshot={snapshot}
                    readOnly={readOnly}
                    onUpdateMeta={actions.updateMeta}
                  />
                ) : (
                  <ResearchRebuttalPromises
                    snapshot={snapshot}
                    readOnly={readOnly}
                    selectedClusterId={selectedClusterId}
                    onUpdate={actions.updatePromises}
                  />
                )}
              </div>
            </>
          }
          agent={
            <ResearchRebuttalAgentPane
              scope={scope}
              visible={agentOpen}
              onRequest={actions.askAgent}
            />
          }
        />
      ) : (
        <ResearchPageBody>
          {loading ? (
            <p role="status" className="text-sm text-muted-foreground">
              Loading rebuttals…
            </p>
          ) : (
            <ResearchEmptyState
              icon={MessageSquareReply}
              title="No rebuttal yet"
              action={
                <Button size="sm" onClick={() => setNewOpen(true)}>
                  <Plus aria-hidden /> New rebuttal
                </Button>
              }
            >
              Paste the reviews you received. The Rebuttal agent splits them into points, groups the
              concerns reviewers share, and drafts answers you edit and assemble here.
            </ResearchEmptyState>
          )}
        </ResearchPageBody>
      )}
      <ResearchRebuttalNewDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreate={actions.create}
      />
      {snapshot ? (
        <ResearchRebuttalOpenReviewDialog
          snapshot={snapshot}
          open={importOpen}
          onOpenChange={setImportOpen}
          onImported={(id) => slug && setReviewerChoice({ slug, id })}
        />
      ) : null}
    </section>
  )
}

export function ResearchRebuttalPage(): React.JSX.Element {
  const context = useAppStore(useShallow(selectResearchWorkspaceContext))
  const { hostId, workspaceId, workspacePath } = context
  const owner = useMemo(
    () => (hostId && workspaceId && workspacePath ? { hostId, workspaceId, workspacePath } : null),
    [hostId, workspaceId, workspacePath]
  )
  if (!owner) {
    return (
      <section aria-label="Rebuttal" className="flex min-h-0 flex-1 flex-col bg-background">
        <ResearchPageHeader title="Rebuttal" />
        <ResearchPageBody>
          <ResearchEmptyState icon={MessageSquareReply} title="No project open">
            Open a project to write its rebuttal.
          </ResearchEmptyState>
        </ResearchPageBody>
      </section>
    )
  }
  return <RebuttalWorkspace key={rebuttalOwnerKey(owner)} owner={owner} />
}
