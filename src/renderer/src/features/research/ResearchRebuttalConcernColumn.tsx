import {
  Check,
  ChevronDown,
  FilePenLine,
  FlaskConical,
  MessageCircle,
  Plus,
  Users
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import {
  CLUSTER_ACTIONS,
  localPointLabel,
  type RebuttalBundle,
  type RebuttalClusterAction
} from '../../../../research-harness/research-rebuttal-model.mjs'
import { POINT_TYPE_LABELS } from './research-rebuttal-highlights'
import { RebuttalTranslationLine } from './ResearchRebuttalTranslation'
import { sharedWith, type RebuttalAnswer } from './research-rebuttal-view'
import type { ClusterLinks, RebuttalActions } from './use-research-rebuttal-actions'

const ACTION_META: Record<RebuttalClusterAction, { label: string; Icon: typeof FlaskConical }> = {
  experiment: { label: 'New experiment', Icon: FlaskConical },
  text: { label: 'Paper edit', Icon: FilePenLine },
  clarify: { label: 'Clarify in reply', Icon: MessageCircle }
}

type Props = {
  answer: RebuttalAnswer
  reviewerId: string
  stacked: boolean
  readOnly: boolean
  links: ClusterLinks | null
  bundle: RebuttalBundle
  actions: RebuttalActions
  onError: (message: string | null) => void
}

/** The left half of an answer row: what the reviewer said and how we plan to answer it. */
export function ResearchRebuttalConcernColumn({
  answer,
  reviewerId,
  stacked,
  readOnly,
  links,
  bundle,
  actions,
  onError
}: Props): React.JSX.Element {
  const { cluster, points, label: answerLabel } = answer
  const shared = sharedWith(bundle, answer, reviewerId)
  const first = points[0]
  const title = cluster?.title || first?.summary || first?.quote || ''
  // Why: a title that is the quote itself is translated under the quote instead.
  const titleKey = cluster?.title
    ? `title:${cluster.id}`
    : first?.summary
      ? `summary:${first.id}`
      : null
  const ActionIcon = cluster ? ACTION_META[cluster.action].Icon : null

  async function run(task: () => Promise<string | null>): Promise<void> {
    onError(await task())
  }

  return (
    <div
      className={cn(
        'min-w-0 space-y-2 p-3',
        stacked ? 'border-b border-border' : 'border-r border-border'
      )}
    >
      <div className="flex flex-wrap items-center gap-1.5 text-2xs">
        <span className="font-mono text-muted-foreground">{answerLabel}</span>
        {points.map((point) => (
          <span
            key={point.id}
            title={POINT_TYPE_LABELS[point.type]}
            className="rounded-sm bg-muted px-1 py-px font-mono text-3xs text-muted-foreground"
          >
            {point.origin === 'prediction' ? 'Anticipated' : localPointLabel(point.id)}
          </span>
        ))}
        <span className="text-muted-foreground">{POINT_TYPE_LABELS[first?.type ?? 'other']}</span>
        {shared.length ? (
          <span
            className="ml-auto inline-flex items-center gap-1 rounded-sm bg-muted px-1 py-px text-3xs text-muted-foreground"
            title={`The same concern from ${shared.join(', ')}: one answer serves them all.`}
          >
            <Users className="size-3" aria-hidden /> Also {shared.join(', ')}
          </span>
        ) : null}
      </div>
      <div className="space-y-0.5">
        <h3 className="text-sm font-medium leading-5">{title}</h3>
        <RebuttalTranslationLine tkey={titleKey} source={title} />
      </div>
      {points.map((point) =>
        point.quote ? (
          <div key={point.id} className="space-y-1">
            <p className="text-xs leading-5 text-muted-foreground">
              <span className="font-mono text-3xs">
                {points.length > 1 ? `${localPointLabel(point.id)} ` : ''}
              </span>
              “{point.quote}”
            </p>
            <RebuttalTranslationLine tkey={`quote:${point.id}`} source={point.quote} />
          </div>
        ) : point.origin === 'prediction' ? (
          <p key={point.id} className="text-xs leading-5 text-muted-foreground">
            Predicted by the simulated reviewer, not something they wrote.
          </p>
        ) : null
      )}
      {cluster?.plan ? (
        <p className="text-xs leading-5 text-muted-foreground">
          <span className="font-medium text-foreground">Plan. </span>
          {cluster.plan}
        </p>
      ) : null}
      {cluster && !readOnly ? (
        <div className="flex flex-wrap items-center gap-1 pt-0.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="xs" variant="ghost">
                {ActionIcon ? <ActionIcon aria-hidden /> : null}
                {ACTION_META[cluster.action].label}
                <ChevronDown aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {CLUSTER_ACTIONS.map((action) => (
                <DropdownMenuItem
                  key={action}
                  onSelect={() => void run(() => actions.changeCluster(cluster.id, { action }))}
                >
                  {ACTION_META[action].label}
                  {cluster.action === action ? (
                    <Check className="ml-auto size-3" aria-hidden />
                  ) : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {links?.onOpenExperiment ? (
            <Button size="xs" variant="ghost" onClick={links.onOpenExperiment}>
              <FlaskConical aria-hidden /> {links.experimentName ?? 'Open Experiment'}
            </Button>
          ) : links?.onCreateExperiment && cluster.action === 'experiment' ? (
            <Button
              size="xs"
              variant="ghost"
              onClick={() => links.onCreateExperiment && void run(links.onCreateExperiment)}
            >
              <Plus aria-hidden /> Create Experiment
            </Button>
          ) : null}
          {links?.onOpenWriting ? (
            <Button size="xs" variant="ghost" onClick={links.onOpenWriting}>
              <FilePenLine aria-hidden /> Open in Writing
            </Button>
          ) : null}
          {cluster.action === 'text' ? (
            <Button
              size="xs"
              variant="ghost"
              onClick={() =>
                void run(() => actions.askAgent({ kind: 'paper-change', clusterId: cluster.id }))
              }
            >
              <FilePenLine aria-hidden /> Propose paper change
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
