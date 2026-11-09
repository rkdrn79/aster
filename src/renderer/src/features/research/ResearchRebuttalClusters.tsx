import { useState } from 'react'
import { Bot, ListTree } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { RebuttalCluster } from '../../../../research-harness/research-rebuttal-model.mjs'
import { ResearchEmptyState } from './ResearchPageLayout'
import { ResearchRebuttalClusterCard, type ClusterLinks } from './ResearchRebuttalClusterCard'
import { clusterIdByPoint } from './research-rebuttal-highlights'
import type { RebuttalAgentRequest } from './research-rebuttal-agent-prompts'
import type { RebuttalSnapshot } from './research-rebuttal-snapshot'

type Props = {
  snapshot: RebuttalSnapshot
  readOnly: boolean
  selectedClusterId: string | null
  onSelectCluster: (clusterId: string | null) => void
  linksFor: (cluster: RebuttalCluster) => ClusterLinks
  onChangeCluster: (clusterId: string, patch: Partial<RebuttalCluster>) => Promise<string | null>
  /** Resolves to an error message, or null once the agent has the request. */
  onAgentRequest: (request: RebuttalAgentRequest) => Promise<string | null>
}

export function ResearchRebuttalClusters({
  snapshot,
  readOnly,
  selectedClusterId,
  onSelectCluster,
  linksFor,
  onChangeCluster,
  onAgentRequest
}: Props): React.JSX.Element {
  const { bundle } = snapshot
  const [error, setError] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)
  const grouped = clusterIdByPoint(bundle)
  const unclustered = bundle.points.filter((point) => !grouped.has(point.id))
  const done = bundle.clusters.filter((cluster) => cluster.status === 'done').length

  async function ask(request: RebuttalAgentRequest): Promise<void> {
    setAsking(true)
    setError(await onAgentRequest(request))
    setAsking(false)
  }

  if (bundle.points.length === 0) {
    return (
      <div className="p-5">
        <ResearchEmptyState
          icon={ListTree}
          title={bundle.meta.reviewers.length ? 'No points yet' : 'Add the reviews first'}
          action={
            bundle.meta.reviewers.length && !readOnly ? (
              <Button size="sm" disabled={asking} onClick={() => void ask({ kind: 'split' })}>
                <Bot aria-hidden /> Split and group the reviews
              </Button>
            ) : null
          }
        >
          {bundle.meta.reviewers.length
            ? 'The Rebuttal agent splits each review into points and groups the ones reviewers share, so each concern gets one answer.'
            : 'Paste each reviewer’s text on the left, or import them from OpenReview.'}
        </ResearchEmptyState>
        {error ? (
          <p role="alert" className="mt-3 text-center text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>
          {bundle.clusters.length} {bundle.clusters.length === 1 ? 'cluster' : 'clusters'} from{' '}
          {bundle.points.length} points
        </span>
        <span aria-hidden>·</span>
        <span>
          {done} of {bundle.clusters.length} done
        </span>
        <div
          className="h-1 min-w-16 flex-1 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label="Clusters done"
          aria-valuemin={0}
          aria-valuemax={bundle.clusters.length}
          aria-valuenow={done}
        >
          <div
            className="h-full rounded-full bg-status-success transition-[width]"
            style={{
              width: `${bundle.clusters.length ? (done / bundle.clusters.length) * 100 : 0}%`
            }}
          />
        </div>
      </div>
      {unclustered.length ? (
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2">
          <span className="text-xs text-muted-foreground">Not grouped yet:</span>
          {unclustered.map((point) => (
            <span
              key={point.id}
              title={point.summary || point.quote}
              className="rounded-sm bg-muted px-1 py-px font-mono text-3xs text-muted-foreground"
            >
              {point.id}
            </span>
          ))}
          {readOnly ? null : (
            <Button
              size="xs"
              variant="ghost"
              className="ml-auto"
              disabled={asking}
              onClick={() => void ask({ kind: 'split' })}
            >
              <Bot aria-hidden /> Group them
            </Button>
          )}
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <div className="space-y-2">
        {bundle.clusters.map((cluster) => (
          <ResearchRebuttalClusterCard
            key={cluster.id}
            cluster={cluster}
            bundle={bundle}
            selected={cluster.id === selectedClusterId}
            readOnly={readOnly}
            links={linksFor(cluster)}
            onSelect={() => onSelectCluster(cluster.id === selectedClusterId ? null : cluster.id)}
            onChange={(patch) => onChangeCluster(cluster.id, patch)}
            onDraftWithAgent={() => onAgentRequest({ kind: 'draft', clusterId: cluster.id })}
          />
        ))}
      </div>
    </div>
  )
}
