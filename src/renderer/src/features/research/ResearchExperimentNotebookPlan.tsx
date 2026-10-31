import { useMemo, useState } from 'react'
import { MoreHorizontal, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useAppStore } from '@/store'
import { cn } from '@/lib/utils'
import type { ResearchExperimentBrief } from '../../../../shared/research/research-experiment-brief'
import type { ResearchRunRecord } from '../../../../shared/research/research-records'
import { openResearchChatTab } from './research-agent-review-launch'
import { experimentChatPrompt } from './research-experiment-agent-chat'
import { ResearchExperimentChatButton } from './ResearchExperimentAgentPane'
import { ResearchExperimentBriefEditor } from './research-experiment-brief-editor'
import { briefBaselineChoices, briefIsEmpty } from './research-experiment-brief-form'
import { useHasNotebookDraft, writeNotebookDraft } from './research-notebook-draft'
import {
  experimentPlanItems,
  planItemStatusLabel,
  type PlanItem,
  type PlanItemStatus
} from './research-experiment-plan'
import type { ExperimentWorkspace } from './research-experiment-workspace-state'
import { summaryBaselineDelta } from './research-experiment-workspace-summary-format'
import { formatDeltaInColumn, formatMetricInColumn } from './research-metric-column-format'
import { researchChatLabel } from './research-handoff-send'
import { NotebookDraftNotice, NotebookSection } from './ResearchExperimentNotebookLayout'
import { catalogRunReference } from './use-research-harness-experiment'

const STATUS_DOT: Record<PlanItemStatus['kind'], string> = {
  proposed: 'border border-muted-foreground',
  approved: 'bg-foreground',
  'needs-code': 'bg-status-warning',
  'handed-off': 'bg-foreground',
  launched: 'bg-muted-foreground/50',
  rejected: 'bg-muted-foreground/30'
}

function metricText(metric: ResearchExperimentBrief['primaryMetric']): string | null {
  if (!metric) {
    return null
  }
  const name = metric.split ? `${metric.split} ${metric.name}` : metric.name
  return `${name} ${metric.direction === 'maximize' ? '↑ higher is better' : '↓ lower is better'}`
}

function PlanFacts({
  brief,
  baselineName
}: {
  brief: ResearchExperimentBrief
  baselineName: string | null
}): React.JSX.Element {
  const evaluation = brief.evaluation
  const rows: [string, string | null][] = [
    ['Hypothesis', brief.hypothesis],
    ['Metric', metricText(brief.primaryMetric)],
    ['Baseline', baselineName],
    ['Seeds', brief.minSeeds ? `at least ${brief.minSeeds} per configuration` : null],
    [
      'Evaluation',
      evaluation
        ? [evaluation.datasetId, evaluation.datasetRevision, evaluation.split]
            .filter(Boolean)
            .join(' · ')
        : null
    ],
    ['Rubric', brief.rubric]
  ]
  return (
    <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
      {rows.map(([label, value]) =>
        value || label === 'Metric' || label === 'Baseline' ? (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className={cn('min-w-0 break-words', !value && 'text-muted-foreground')}>
              {value ?? 'Not set'}
            </dd>
          </div>
        ) : null
      )}
    </dl>
  )
}

function LaunchedResult({
  workspace,
  reference
}: {
  workspace: ExperimentWorkspace
  reference: string
}): React.JSX.Element {
  const run = workspace.runs.find((entry) => catalogRunReference(entry) === reference)
  const summary = workspace.summaries.byRun.get(reference) ?? null
  const value = summary?.primary?.last ?? null
  const delta = summaryBaselineDelta(summary, workspace.baseline?.reference ?? null, 'last')
  const decimals = workspace.metricDecimals
  const result = value
    ? `${formatMetricInColumn(value.value, decimals)}${delta === null ? '' : ` (${formatDeltaInColumn(delta, decimals)})`}`
    : null
  return (
    <>
      {run ? (
        <button
          type="button"
          className="max-w-40 truncate rounded-sm hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => workspace.openRun(run.id)}
        >
          {run.name}
        </button>
      ) : (
        <span className="max-w-40 truncate font-mono">{reference}</span>
      )}
      {result ? <span className="font-mono tabular-nums text-foreground">{result}</span> : null}
    </>
  )
}

function HandedOff({
  workspace,
  sessionId
}: {
  workspace: ExperimentWorkspace
  sessionId: string | null
}): React.JSX.Element {
  const experiment = workspace.experiment
  const tab = useAppStore((state) =>
    sessionId && experiment
      ? (state.unifiedTabsByWorktree[experiment.workspaceId] ?? []).find(
          (entry) => entry.entityId === sessionId
        )
      : undefined
  )
  return (
    <>
      <span className="max-w-48 truncate">Handed to {researchChatLabel(tab)}</span>
      {tab && sessionId && experiment ? (
        <Button
          size="xs"
          variant="ghost"
          onClick={() => openResearchChatTab(experiment.workspaceId, sessionId)}
        >
          Open
        </Button>
      ) : null}
    </>
  )
}

function PlanRow({
  item,
  workspace
}: {
  item: PlanItem
  workspace: ExperimentWorkspace
}): React.JSX.Element {
  const { proposal, status } = item
  const { decisions } = workspace
  return (
    <li
      aria-label={`Planned run ${proposal.title}`}
      className="flex min-h-7 min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 py-0.5 text-sm"
    >
      <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', STATUS_DOT[status.kind])} />
      {/* Why wrap: a narrow window must still show the whole planned Run, not an ellipsis. */}
      <span className="min-w-48 flex-1 break-words" title={proposal.rationale || undefined}>
        {proposal.title}
      </span>
      <span className="ml-auto flex min-w-0 shrink-0 items-center gap-2 text-xs text-muted-foreground">
        {status.kind === 'handed-off' ? (
          <HandedOff workspace={workspace} sessionId={status.sessionId} />
        ) : (
          <span>{planItemStatusLabel(status)}</span>
        )}
        {status.kind === 'launched' && status.run ? (
          <LaunchedResult workspace={workspace} reference={status.run} />
        ) : null}
        {status.kind === 'approved' ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label={`${proposal.title} options`}
                disabled={decisions.busyId !== null}
              >
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => decisions.resend(proposal)}>
                Tell the proposing agent again
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => decisions.sendToExperimentChat(proposal)}>
                Send to experiment chat to launch
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </span>
    </li>
  )
}

function PlannedRuns({ workspace }: { workspace: ExperimentWorkspace }): React.JSX.Element | null {
  const [showRejected, setShowRejected] = useState(false)
  const { runs, statusOf, proposals } = workspace
  const plan = useMemo(() => {
    const byReference = new Map<string, ResearchRunRecord>()
    for (const run of runs) {
      const reference = catalogRunReference(run)
      if (reference) {
        byReference.set(reference, run)
      }
    }
    return experimentPlanItems(proposals.proposals, (reference) => {
      const run = byReference.get(reference)
      return run ? statusOf(run).state : null
    })
  }, [proposals.proposals, runs, statusOf])
  if (!plan.items.length && !plan.rejected.length) {
    return null
  }
  const shown = showRejected ? [...plan.items, ...plan.rejected] : plan.items
  return (
    <div className="space-y-1">
      <h3 className="text-xs font-medium text-muted-foreground">Planned runs</h3>
      <ul aria-label="Planned runs">
        {shown.map((item) => (
          <PlanRow key={item.proposal.id} item={item} workspace={workspace} />
        ))}
      </ul>
      {plan.rejected.length ? (
        <Button size="xs" variant="ghost" onClick={() => setShowRejected((value) => !value)}>
          {showRejected ? 'Hide rejected' : `${plan.rejected.length} rejected`}
        </Button>
      ) : null}
    </div>
  )
}

/** The question, how it is judged, and the Runs planned to answer it; edited inline. */
export function ResearchExperimentNotebookPlan({
  workspace
}: {
  workspace: ExperimentWorkspace
}): React.JSX.Element | null {
  const { experiment, document, runs, brief, scope } = workspace
  // Why the Experiment ID: switching Experiments must close an open form.
  const [editingId, setEditingId] = useState<string | null>(null)
  const hasDraft = useHasNotebookDraft('plan', experiment?.id ?? null)
  const baselines = useMemo(
    () =>
      experiment && document
        ? briefBaselineChoices(experiment, document.experiments, document.runs)
        : [],
    [document, experiment]
  )
  const metricNames = useMemo(
    () => [
      ...new Set(runs.flatMap((run) => run.metricSnapshot?.metrics.map((item) => item.name) ?? []))
    ],
    [runs]
  )
  if (!experiment) {
    return null
  }
  if (!scope) {
    return (
      <NotebookSection label="Plan">
        <p className="text-sm text-muted-foreground">
          {experiment.hostId !== 'local' && experiment.catalogSlug
            ? "Plans and quality checks are available for local projects with a research catalog. The experiment agent in Chat works with this server's catalog."
            : 'Plans, quality checks, and the experiment agent are available for local projects with a research catalog.'}
        </p>
      </NotebookSection>
    )
  }
  if (!brief.available || !brief.loaded) {
    return (
      <NotebookSection label="Plan">
        <p className="text-sm text-muted-foreground">
          {brief.available ? 'Reading the plan…' : 'Reload Aster to read this plan.'}
        </p>
      </NotebookSection>
    )
  }
  const current = brief.brief
  const editing = editingId === experiment.id
  const empty = briefIsEmpty(current) && !workspace.proposals.proposals.length
  const baselineName = current?.baseline
    ? (baselines.find((item) => item.reference === current.baseline)?.name ?? current.baseline)
    : null
  const editButton = (
    <Button size="xs" variant="ghost" onClick={() => setEditingId(experiment.id)}>
      <Pencil aria-hidden />
      Edit
    </Button>
  )
  return (
    <NotebookSection label="Plan" action={editing || empty || hasDraft ? null : editButton}>
      {!editing && hasDraft ? (
        <NotebookDraftNotice
          label="Unsaved plan changes"
          onResume={() => setEditingId(experiment.id)}
          onDiscard={() => writeNotebookDraft('plan', experiment.id, null)}
        />
      ) : null}
      {editing ? (
        <ResearchExperimentBriefEditor
          key={experiment.id}
          experimentId={experiment.id}
          brief={current}
          baselines={baselines}
          metricNames={metricNames}
          onSave={async (patch) => {
            await brief.update(patch)
            setEditingId(null)
            workspace.afterBriefSaved(patch)
          }}
          onCancel={() => setEditingId(null)}
        />
      ) : empty ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Decide the question, how to judge it, and the Runs that answer it. The experiment agent
            can draft this with you from the code and earlier Runs.
          </p>
          <div className="flex items-center gap-2">
            <ResearchExperimentChatButton
              experiment={experiment}
              variant="default"
              build={(setup) => experimentChatPrompt('design', setup)}
            >
              Design with the agent
            </ResearchExperimentChatButton>
            <Button size="xs" variant="ghost" onClick={() => setEditingId(experiment.id)}>
              Write plan
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {current && !briefIsEmpty(current) ? (
            <div className="space-y-2">
              <p
                className={cn(
                  'text-base',
                  current.question ? 'font-medium' : 'text-muted-foreground'
                )}
              >
                {current.question ?? 'No question yet'}
              </p>
              <PlanFacts brief={current} baselineName={baselineName} />
            </div>
          ) : null}
          <PlannedRuns workspace={workspace} />
        </div>
      )}
      {brief.error ? (
        <p role="alert" className="text-xs text-destructive">
          {brief.error}
        </p>
      ) : null}
    </NotebookSection>
  )
}
