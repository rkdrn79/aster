import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import type { RebuttalReviewer } from '../../../../research-harness/research-rebuttal-model.mjs'
import { useResearchRecords } from './research-records-store'
import { ResearchRebuttalAgentPane } from './ResearchRebuttalAgentPane'
import { ResearchRebuttalDebatePane } from './ResearchRebuttalDebatePane'
import { ResearchRebuttalReviewPane } from './ResearchRebuttalReviewPane'
import type { RebuttalAgentRequest } from './research-rebuttal-agent-prompts'
import type { RebuttalAgentScope } from './research-rebuttal-agent-session'
import { reviewerAgentSessionId } from './research-rebuttal-reviewer-session'
import type { RebuttalSnapshot } from './research-rebuttal-snapshot'
import type { RebuttalActions } from './use-research-rebuttal-actions'

export type RebuttalSideTab = 'review' | 'debate' | 'author'

type Props = {
  scope: RebuttalAgentScope
  snapshot: RebuttalSnapshot
  /** Null on the General and Finish views, where Review and Debate have no reviewer. */
  reviewer: RebuttalReviewer | null
  readOnly: boolean
  tab: RebuttalSideTab
  onTabChange: (tab: RebuttalSideTab) => void
  actions: RebuttalActions
  onRequest: (request: RebuttalAgentRequest) => Promise<string | null>
}

/** The review as written, this reviewer's simulated agent, and the author-side agent. */
export function ResearchRebuttalSidePanel({
  scope,
  snapshot,
  reviewer,
  readOnly,
  tab,
  onTabChange,
  actions,
  onRequest
}: Props): React.JSX.Element {
  const slug = snapshot.bundle.meta.slug
  const reviewers = snapshot.bundle.meta.reviewers
  const records = useResearchRecords((state) => state.document)
  const reviewerId = reviewer?.id ?? null
  // Why every started chat stays mounted: each keeps its composer and scroll while another shows.
  const started = useMemo(
    () =>
      reviewers.filter(
        (entry) => entry.id === reviewerId || reviewerAgentSessionId(records, scope, slug, entry.id)
      ),
    [reviewers, reviewerId, records, scope, slug]
  )
  const activeTab: RebuttalSideTab = tab === 'author' || reviewer ? tab : 'author'
  const tabs: { id: RebuttalSideTab; label: string; disabled?: boolean }[] = [
    ...(reviewer ? [{ id: 'review' as const, label: 'Review' }] : []),
    ...(reviewer ? [{ id: 'debate' as const, label: `Simulated ${reviewer.id}` }] : []),
    { id: 'author', label: 'Rebuttal agent' }
  ]
  return (
    <section aria-label="Rebuttal side panel" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div
        role="tablist"
        aria-label="Side panel views"
        className="flex shrink-0 items-center gap-1 border-b border-border px-2 py-1.5"
      >
        {tabs.map((entry) => (
          <Button
            key={entry.id}
            role="tab"
            aria-selected={activeTab === entry.id}
            size="xs"
            variant={activeTab === entry.id ? 'secondary' : 'ghost'}
            className="min-w-0"
            onClick={() => onTabChange(entry.id)}
          >
            <span className="truncate">{entry.label}</span>
          </Button>
        ))}
      </div>
      {reviewer && activeTab === 'review' ? (
        <ResearchRebuttalReviewPane
          snapshot={snapshot}
          reviewer={reviewer}
          readOnly={readOnly}
          actions={actions}
        />
      ) : null}
      {started.map((entry) => (
        <ResearchRebuttalDebatePane
          key={entry.id}
          scope={scope}
          snapshot={snapshot}
          reviewerId={entry.id}
          visible={activeTab === 'debate' && entry.id === reviewerId}
          actions={actions}
        />
      ))}
      <ResearchRebuttalAgentPane
        scope={scope}
        visible={activeTab === 'author'}
        onRequest={onRequest}
      />
    </section>
  )
}
