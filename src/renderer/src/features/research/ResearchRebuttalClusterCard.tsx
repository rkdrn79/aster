import { useState } from 'react'
import {
  Bot,
  CircleCheck,
  CircleDashed,
  CircleDot,
  FilePenLine,
  FlaskConical,
  MessageCircle,
  Plus
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import type {
  RebuttalBundle,
  RebuttalCluster,
  RebuttalClusterAction,
  RebuttalClusterStatus
} from '../../../../research-harness/research-rebuttal-model.mjs'
import { POINT_KIND_LABELS } from './research-rebuttal-highlights'
import { ResearchRebuttalDraftField } from './ResearchRebuttalDraftField'

export const CLUSTER_ACTION_LABELS: Record<RebuttalClusterAction, string> = {
  experiment: 'New experiment',
  text: 'Paper edit',
  clarify: 'Clarify'
}

const ACTION_ICONS = { experiment: FlaskConical, text: FilePenLine, clarify: MessageCircle }
const STATUS_ICONS = { todo: CircleDashed, drafting: CircleDot, done: CircleCheck }
const STATUS_LABELS: Record<RebuttalClusterStatus, string> = {
  todo: 'To do',
  drafting: 'Drafting',
  done: 'Done'
}

export type ClusterLinks = {
  experimentName: string | null
  onOpenExperiment: (() => void) | null
  onCreateExperiment: (() => Promise<string | null>) | null
  onOpenWriting: (() => void) | null
}

type Props = {
  cluster: RebuttalCluster
  bundle: RebuttalBundle
  selected: boolean
  readOnly: boolean
  links: ClusterLinks
  onSelect: () => void
  /** Each resolves to an error message, or null once saved. */
  onChange: (patch: Partial<RebuttalCluster>) => Promise<string | null>
  onDraftWithAgent: () => Promise<string | null>
}

export function ResearchRebuttalClusterCard({
  cluster,
  bundle,
  selected,
  readOnly,
  links,
  onSelect,
  onChange,
  onDraftWithAgent
}: Props): React.JSX.Element {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const StatusIcon = STATUS_ICONS[cluster.status]
  const ActionIcon = ACTION_ICONS[cluster.action]
  const points = bundle.points.filter((point) => cluster.points.includes(point.id))

  async function run(task: () => Promise<string | null>): Promise<void> {
    setBusy(true)
    setError(await task())
    setBusy(false)
  }

  return (
    <article
      aria-label={`${cluster.id}: ${cluster.title}`}
      data-selected={selected ? 'true' : undefined}
      className={cn(
        'rounded-lg border bg-card text-card-foreground transition-colors',
        selected ? 'border-ring/70 shadow-xs' : 'border-border hover:border-muted-foreground/35'
      )}
    >
      <div className="flex items-start gap-2.5 px-3 py-2.5">
        <StatusIcon
          aria-label={STATUS_LABELS[cluster.status]}
          className={cn(
            'mt-0.5 size-4 shrink-0',
            cluster.status === 'done' ? 'text-status-success' : 'text-muted-foreground'
          )}
        />
        <button
          type="button"
          aria-expanded={selected}
          className="min-w-0 flex-1 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onSelect}
        >
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="shrink-0 font-mono text-2xs text-muted-foreground">{cluster.id}</span>
            <span className="min-w-0 truncate text-sm font-medium">{cluster.title}</span>
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-1">
            {cluster.points.map((id) => (
              <span
                key={id}
                className="rounded-sm bg-muted px-1 py-px font-mono text-3xs text-muted-foreground"
              >
                {id}
              </span>
            ))}
            <span className="ml-1 inline-flex items-center gap-1 text-2xs text-muted-foreground">
              <ActionIcon className="size-3" aria-hidden />
              {CLUSTER_ACTION_LABELS[cluster.action]}
            </span>
            {links.experimentName ? (
              <span className="inline-flex items-center gap-1 text-2xs text-muted-foreground">
                · {links.experimentName}
              </span>
            ) : null}
            {cluster.manuscript ? (
              <span className="truncate font-mono text-3xs text-muted-foreground">
                · {cluster.manuscript.file}
                {cluster.manuscript.line ? `:${cluster.manuscript.line}` : ''}
              </span>
            ) : null}
          </span>
        </button>
        <span className="shrink-0 text-2xs text-muted-foreground tabular-nums">
          {cluster.response ? `${cluster.response.length.toLocaleString()} chars` : 'No draft'}
        </span>
      </div>
      {selected ? (
        <div className="space-y-3 border-t border-border px-3 pt-3 pb-3">
          {cluster.plan ? (
            <p className="text-xs leading-5 text-muted-foreground">
              <span className="font-medium text-foreground">Plan. </span>
              {cluster.plan}
            </p>
          ) : null}
          <ul className="space-y-1.5" aria-label="Reviewer comments">
            {points.map((point) => (
              <li key={point.id} className="text-xs leading-5">
                <span className="font-mono text-3xs text-muted-foreground">{point.id}</span>{' '}
                <span className="text-muted-foreground">{POINT_KIND_LABELS[point.kind]}:</span>{' '}
                {point.summary || point.quote}
              </li>
            ))}
          </ul>
          <ResearchRebuttalDraftField
            label="Response"
            value={cluster.response}
            readOnly={readOnly}
            placeholder="Answer the concern directly; give numbers from your runs, never invented ones."
            onSave={(response) =>
              onChange({
                response,
                ...(cluster.status === 'todo' && response.trim() ? { status: 'drafting' } : {})
              })
            }
          />
          <div className="flex flex-wrap items-center gap-2">
            <ToggleGroup
              type="single"
              variant="outline"
              size="xs"
              value={cluster.status}
              disabled={readOnly}
              aria-label="Status"
              onValueChange={(value) => {
                if (value === 'todo' || value === 'drafting' || value === 'done') {
                  void run(() => onChange({ status: value }))
                }
              }}
            >
              {(['todo', 'drafting', 'done'] as const).map((status) => (
                <ToggleGroupItem key={status} value={status}>
                  {STATUS_LABELS[status]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <ToggleGroup
              type="single"
              variant="outline"
              size="xs"
              value={cluster.action}
              disabled={readOnly}
              aria-label="Plan"
              onValueChange={(value) => {
                if (value === 'experiment' || value === 'text' || value === 'clarify') {
                  void run(() => onChange({ action: value }))
                }
              }}
            >
              {(['experiment', 'text', 'clarify'] as const).map((action) => (
                <ToggleGroupItem key={action} value={action}>
                  {CLUSTER_ACTION_LABELS[action]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {links.onOpenExperiment ? (
              <Button size="xs" variant="outline" onClick={links.onOpenExperiment}>
                <FlaskConical aria-hidden /> Open {links.experimentName ?? 'Experiment'}
              </Button>
            ) : links.onCreateExperiment && cluster.action === 'experiment' && !readOnly ? (
              <Button
                size="xs"
                variant="outline"
                disabled={busy}
                onClick={() => links.onCreateExperiment && void run(links.onCreateExperiment)}
              >
                <Plus aria-hidden /> Create Experiment
              </Button>
            ) : null}
            {links.onOpenWriting ? (
              <Button size="xs" variant="outline" onClick={links.onOpenWriting}>
                <FilePenLine aria-hidden /> Open in Writing
              </Button>
            ) : null}
            {readOnly ? null : (
              <Button
                size="xs"
                variant="ghost"
                disabled={busy}
                onClick={() => void run(onDraftWithAgent)}
              >
                <Bot aria-hidden /> Draft with agent
              </Button>
            )}
          </div>
          {error ? (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}
