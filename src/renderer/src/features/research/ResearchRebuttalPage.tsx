import { useCallback, useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { MessageSquareReply, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store'
import { ResearchEmptyState, ResearchPageBody, ResearchPageHeader } from './ResearchPageLayout'
import { ResearchRebuttalAgentWatcher } from './ResearchRebuttalAgentWatcher'
import { ResearchRebuttalAssemble } from './ResearchRebuttalAssemble'
import { ResearchRebuttalFinish } from './ResearchRebuttalFinish'
import { ResearchRebuttalFirstStep } from './ResearchRebuttalFirstStep'
import { ResearchRebuttalHeaderActions } from './ResearchRebuttalHeaderActions'
import { ResearchRebuttalLayout, REBUTTAL_OVERLAY_BELOW } from './ResearchRebuttalLayout'
import { ResearchRebuttalNewDialog } from './ResearchRebuttalNewDialog'
import { ResearchRebuttalOpenReviewDialog } from './ResearchRebuttalOpenReviewDialog'
import { ResearchRebuttalPaperChangesBar } from './ResearchRebuttalPaperChangesBar'
import { ResearchRebuttalPicker } from './ResearchRebuttalPicker'
import { ResearchRebuttalReviewDialog } from './ResearchRebuttalReviewDialog'
import { ResearchRebuttalReviewerRail, type RebuttalView } from './ResearchRebuttalReviewerRail'
import { ResearchRebuttalReviewerView } from './ResearchRebuttalReviewerView'
import { ResearchRebuttalSidePanel, type RebuttalSideTab } from './ResearchRebuttalSidePanel'
import { RebuttalTranslationProvider } from './ResearchRebuttalTranslation'
import { ResearchRebuttalWaitingChanges } from './ResearchRebuttalWaitingChanges'
import { useResearchRecords } from './research-records-store'
import {
  consumeRebuttalAgentFocus,
  rebuttalAgentSessionId,
  subscribeRebuttalAgentFocus
} from './research-rebuttal-agent-session'
import { rebuttalOwnerKey, type RebuttalOwner } from './research-rebuttal-files'
import {
  openRebuttalProject,
  useRebuttalAutoRefresh,
  useResearchRebuttal
} from './research-rebuttal-store'
import { selectResearchWorkspaceContext } from './research-workspace-context'
import { reviewerAnswers, reviewerRounds } from './research-rebuttal-view'
import { useRebuttalPageTranslations } from './use-rebuttal-page-translations'
import { useResearchRebuttalActions } from './use-research-rebuttal-actions'

const SIDE_OPEN_KEY = 'aster.research-rebuttal-side-open.v1'

function readSideOpen(): boolean {
  try {
    return localStorage.getItem(SIDE_OPEN_KEY) !== 'false'
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
  const [viewChoice, setViewChoice] = useState<{ slug: string; view: RebuttalView }>()
  const scope = useMemo(
    () => ({ hostId: owner.hostId, workspaceId: owner.workspaceId }),
    [owner.hostId, owner.workspaceId]
  )
  const records = useResearchRecords((state) => state.document)
  const [sideOpen, setSideOpenState] = useState(
    () => consumeRebuttalAgentFocus(scope) || readSideOpen()
  )
  const [sideTab, setSideTab] = useState<RebuttalSideTab>('review')
  // Why separate: a narrow window opens the panel over the replies, so it starts closed there.
  const [{ contentWidth, mainWidth }, setWidths] = useState({ contentWidth: 0, mainWidth: 0 })
  const onWidth = useCallback(
    (nextContent: number, nextMain: number) =>
      setWidths({ contentWidth: nextContent, mainWidth: nextMain }),
    []
  )
  const [overlayOpen, setOverlayOpen] = useState(false)
  const narrow = contentWidth > 0 && contentWidth < REBUTTAL_OVERLAY_BELOW
  const [newOpen, setNewOpen] = useState(false)
  const [menuError, setMenuError] = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [reviewDialog, setReviewDialog] = useState<'add' | 'edit' | null>(null)
  // Why: pasting reviews one by one keeps the first step open until the person moves on.
  const [addingMore, setAddingMore] = useState(false)
  const panelOpen = narrow ? overlayOpen : sideOpen
  const setSideOpen = (open: boolean): void => {
    setOverlayOpen(open)
    setSideOpenState(open)
    try {
      localStorage.setItem(SIDE_OPEN_KEY, String(open))
    } catch {
      // The panel still toggles without storage.
    }
  }
  useEffect(() => {
    void openRebuttalProject(owner)
    void useResearchRecords.getState().load()
  }, [owner])
  useRebuttalAutoRefresh(owner, true)
  useEffect(
    () =>
      subscribeRebuttalAgentFocus(() => {
        if (consumeRebuttalAgentFocus(scope)) {
          setSideOpenState(true)
          setSideTab('author')
        }
      }),
    [scope]
  )

  const slug = snapshot?.bundle.meta.slug ?? null
  const reviewers = useMemo(() => snapshot?.bundle.meta.reviewers ?? [], [snapshot])
  const firstReviewerId = reviewers[0]?.id ?? 'finish'
  const candidate = viewChoice?.slug === slug ? viewChoice.view : firstReviewerId
  const view =
    candidate === 'general' ||
    candidate === 'finish' ||
    reviewers.some((entry) => entry.id === candidate)
      ? candidate
      : firstReviewerId
  const reviewer = reviewers.find((entry) => entry.id === view) ?? null
  const reviewerIds = useMemo(() => reviewers.map((entry) => entry.id), [reviewers])
  const actions = useResearchRebuttalActions(owner, snapshot, {
    onReviewSaved: (id) => {
      if (slug) {
        setViewChoice({ slug, view: id })
      }
    },
    onAgentAsked: () => {
      if (!rebuttalAgentSessionId(records, scope)) {
        setSideOpen(true)
        setSideTab('author')
      }
    }
  })
  const readOnly = Boolean(snapshot?.issues.length)
  const showFirstStep = snapshot && (reviewers.length === 0 || addingMore)
  const translations = useRebuttalPageTranslations({
    scope,
    snapshot,
    readOnly,
    askAgent: actions.askAgent
  })

  const reviewerSlots = new Set(
    snapshot && reviewer
      ? reviewerRounds(snapshot.bundle, reviewer.id)
          .flatMap((round) => reviewerAnswers(snapshot.bundle, reviewer.id, round))
          .flatMap((answer) => (answer.cluster ? [answer.cluster.id] : []))
      : []
  )
  const reviewerProposals = snapshot
    ? snapshot.proposals.filter((proposal) => reviewerSlots.has(proposal.slot))
    : []
  const reviewerPaperChanges = snapshot
    ? snapshot.paperChanges.filter(
        (change) => change.status === 'pending' && reviewerSlots.has(change.cluster)
      )
    : []
  const generalProposals = snapshot
    ? snapshot.proposals.filter((proposal) => proposal.slot.startsWith('general:'))
    : []

  return (
    <RebuttalTranslationProvider value={translations.lookup}>
      <section
        aria-label="Rebuttal"
        className="flex min-h-0 flex-1 flex-col bg-background text-foreground"
      >
        <ResearchPageHeader
          title="Rebuttal"
          context={
            <ResearchRebuttalPicker
              owner={owner}
              rebuttals={rebuttals}
              selectedSlug={selectedSlug}
              onNew={() => setNewOpen(true)}
            />
          }
          actions={
            snapshot && !showFirstStep ? (
              <ResearchRebuttalHeaderActions
                snapshot={snapshot}
                readOnly={readOnly}
                translations={translations}
                actions={actions}
                panelOpen={panelOpen}
                onPanelOpenChange={setSideOpen}
                onImportAgain={() => setImportOpen(true)}
                onAddReviewer={() => setReviewDialog('add')}
                onError={setMenuError}
              />
            ) : null
          }
        />
        {error || menuError ? (
          <p role="alert" className="border-b border-border px-6 py-2 text-xs text-destructive">
            {error ?? menuError}
          </p>
        ) : null}
        {snapshot?.issues.length ? (
          <div
            role="alert"
            className="border-b border-border px-6 py-2 text-xs text-status-warning"
          >
            Read-only until these files validate (ask the agent to fix them):{' '}
            {snapshot.issues.join(' · ')}
          </div>
        ) : null}
        {snapshot && showFirstStep ? (
          <>
            {reviewers.length ? (
              <div className="flex shrink-0 items-center gap-2 border-b border-border px-6 py-2">
                <span className="text-xs text-muted-foreground">
                  {reviewers.map((entry) => entry.label || entry.id).join(', ')} added.
                </span>
                <Button
                  size="xs"
                  className="ml-auto"
                  onClick={() => {
                    setAddingMore(false)
                    if (slug) {
                      setViewChoice({ slug, view: firstReviewerId })
                    }
                  }}
                >
                  Continue to the reviewers
                </Button>
              </div>
            ) : null}
            <ResearchRebuttalFirstStep
              snapshot={snapshot}
              readOnly={readOnly}
              onSaveReview={(input) => {
                // Why before saving: the first saved review would otherwise leave this step.
                setAddingMore(true)
                return actions.saveReview(input)
              }}
              onImported={(id) => {
                if (slug) {
                  setViewChoice({ slug, view: id })
                }
                setAddingMore(false)
              }}
            />
          </>
        ) : snapshot ? (
          <>
            <ResearchRebuttalReviewerRail
              snapshot={snapshot}
              view={view}
              onViewChange={(next) => slug && setViewChoice({ slug, view: next })}
            />
            <ResearchRebuttalLayout
              sideOpen={panelOpen}
              onWidth={onWidth}
              main={
                reviewer ? (
                  <>
                    {reviewerProposals.length || reviewerPaperChanges.length > 1 ? (
                      <div className="shrink-0 space-y-1 border-b border-border px-4 py-1.5">
                        <ResearchRebuttalWaitingChanges
                          compact
                          proposals={reviewerProposals}
                          readOnly={readOnly}
                          actions={actions}
                        />
                        {reviewerPaperChanges.length > 1 ? (
                          <ResearchRebuttalPaperChangesBar
                            changes={reviewerPaperChanges}
                            readOnly={readOnly}
                            onApplyAll={actions.approvePaperChanges}
                          />
                        ) : null}
                      </div>
                    ) : null}
                    <ResearchRebuttalReviewerView
                      snapshot={snapshot}
                      reviewer={reviewer}
                      readOnly={readOnly}
                      stacked={mainWidth > 0 && mainWidth < 700}
                      actions={actions}
                      onEditReview={() => setReviewDialog('edit')}
                      onOpenDebate={() => {
                        setSideOpen(true)
                        setSideTab('debate')
                      }}
                    />
                  </>
                ) : view === 'general' ? (
                  <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto">
                    <div className="mx-auto max-w-3xl space-y-4 p-4 pb-16">
                      <ResearchRebuttalWaitingChanges
                        proposals={generalProposals}
                        readOnly={readOnly}
                        actions={actions}
                      />
                      <ResearchRebuttalAssemble
                        snapshot={snapshot}
                        readOnly={readOnly}
                        onUpdateMeta={actions.updateMeta}
                        actions={actions}
                        only="general"
                      />
                    </div>
                  </div>
                ) : (
                  <ResearchRebuttalFinish
                    snapshot={snapshot}
                    readOnly={readOnly}
                    actions={actions}
                    onOpenReviewer={(id) => slug && setViewChoice({ slug, view: id })}
                  />
                )
              }
              side={
                <ResearchRebuttalSidePanel
                  scope={scope}
                  snapshot={snapshot}
                  reviewer={reviewer}
                  readOnly={readOnly}
                  tab={sideTab}
                  onTabChange={setSideTab}
                  actions={actions}
                  onRequest={actions.askAgent}
                />
              }
            />
            <ResearchRebuttalAgentWatcher
              scope={scope}
              slug={snapshot.bundle.meta.slug}
              reviewerIds={reviewerIds}
            />
          </>
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
                Start one for this venue round, then bring in the reviews from OpenReview or by
                paste. Each reviewer gets a page with their concerns next to your replies.
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
          <>
            <ResearchRebuttalOpenReviewDialog
              snapshot={snapshot}
              open={importOpen}
              onOpenChange={setImportOpen}
              onImported={(id) => slug && setViewChoice({ slug, view: id })}
            />
            <ResearchRebuttalReviewDialog
              snapshot={snapshot}
              mode={reviewDialog}
              reviewer={reviewer}
              onOpenChange={(open) => !open && setReviewDialog(null)}
              onSave={async (input) => {
                const failure = await actions.saveReview(input)
                if (!failure) {
                  setReviewDialog(null)
                  setAddingMore(false)
                }
                return failure
              }}
            />
          </>
        ) : null}
      </section>
    </RebuttalTranslationProvider>
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
