import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { getResolvedExecutionHostIdForWorktree } from '@/lib/resolved-worktree-execution-host'
import type { ResearchExperimentBriefPatch } from '../../../../shared/research/research-experiment-brief'
import type {
  ResearchDocument,
  ResearchRunRecord
} from '../../../../shared/research/research-records'
import { selectResearchRun } from '../../../../shared/research/research-selection'
import { useResearchRecords } from './research-records-store'
import { detachResearchRun } from './research-run-record-links'
import { useRemoteHostLabel } from './research-host-label'
import { researchErrorText } from './research-error-text'
import { effectiveRunStatusFacts, type ResearchRunStatusFacts } from './research-run-status-label'
import { useResearchAttachRun } from './use-research-attach-run'
import {
  catalogRunReference,
  harnessExperimentSlug,
  useResearchHarnessExperiment
} from './use-research-harness-experiment'
import { useResearchFindings } from './use-research-findings'
import { useResearchRunSummaries } from './use-research-run-summaries'
import { useResearchAutoOrganize } from './use-research-auto-organize'
import { useExperimentBrief } from './research-experiment-brief-state'
import { useResearchProposalDecisions, useResearchProposals } from './research-proposal-list-state'
import {
  MAX_COMPARED_RUNS,
  experimentCheckedRuns,
  toggleExperimentComparison
} from './research-comparison-scope'
import {
  baselineChoices,
  experimentBaseline,
  experimentComparedRuns,
  type BaselineChoice
} from './research-experiment-workspace-baseline'
import { experimentNeedsYou } from './research-experiment-needs-you'
import { primaryMetricDecimals } from './research-experiment-workspace-summary-format'
import { runSummaryOf } from './research-experiment-notebook-results'
import { useDismissedRuns } from './research-experiment-dismissed-runs'
import {
  lastExperimentDetailPage,
  toggledExperimentPage,
  useExperimentPage
} from './research-experiment-page'
import { useComparedRunEntries } from './research-experiment-workspace-compare'
import { useResearchAnalyses } from './use-research-analysis'
import { contextPacket } from './research-context-packet'
import type { AgentReviewScope } from './research-agent-review-launch'

const NO_RUNS: ResearchRunRecord[] = []

function organizeBridge(): Partial<Window['api']['researchOrganize']> {
  return window.api.researchOrganize ?? {}
}

/** Everything the Experiment screen shows, read once and shared by the notebook and Details. */
export function useExperimentWorkspace(viewPage: 'runs' | 'compare') {
  const document = useResearchRecords((state) => state.document)
  const error = useResearchRecords((state) => state.error)
  const saving = useResearchRecords((state) => state.saving)
  const activeWorkspaceId = useAppStore((state) => state.activeWorktreeId)
  const activeHostId = useAppStore((state) =>
    getResolvedExecutionHostIdForWorktree(state, state.activeWorktreeId)
  )
  const experiment = document?.experiments.find(
    (entry) =>
      entry.id === document.selectedExperimentId &&
      entry.workspaceId === activeWorkspaceId &&
      entry.hostId === activeHostId
  )
  const allRuns = document?.runs ?? NO_RUNS
  const experimentId = experiment?.id ?? null
  const runs = useMemo(
    () => (experimentId ? allRuns.filter((run) => run.experimentId === experimentId) : NO_RUNS),
    [allRuns, experimentId]
  )
  const [page, setPage] = useExperimentPage(experimentId, viewPage)
  const slug = harnessExperimentSlug(experiment)
  const scope: AgentReviewScope | null =
    experiment && slug
      ? {
          workspaceId: experiment.workspaceId,
          hostId: experiment.hostId,
          workspacePath: experiment.workspacePath,
          experiment: slug
        }
      : null

  // Why a counter in the key: a Run the app just changed must not wait for the next poll.
  const [harnessReads, setHarnessReads] = useState(0)
  const harness = useResearchHarnessExperiment(
    experiment,
    `${runs.map((run) => run.id).join(',')}#${harnessReads}`
  )
  const findings = useResearchFindings(experiment)
  const brief = useExperimentBrief(experiment)
  const proposals = useResearchProposals(experiment)
  const decisions = useResearchProposalDecisions(experiment, proposals.replace)
  const summaries = useResearchRunSummaries(experiment)
  useResearchAutoOrganize(experiment, runs, summaries)
  const analyses = useResearchAnalyses(experiment)
  const attach = useResearchAttachRun(experiment, document, saving)
  const remoteHost = useRemoteHostLabel(experiment?.hostId)
  const dismissedRuns = useDismissedRuns(experimentId)

  const statusOf = useCallback(
    (run: ResearchRunRecord): ResearchRunStatusFacts => {
      const reference = catalogRunReference(run)
      return effectiveRunStatusFacts(run, reference ? harness.statuses.get(reference) : undefined)
    },
    [harness.statuses]
  )
  const comparisonRunIds = document?.comparisonRunIds
  const checked = useMemo(
    () =>
      experimentId && comparisonRunIds
        ? experimentCheckedRuns({ runs: allRuns, comparisonRunIds }, experimentId)
        : NO_RUNS,
    [allRuns, comparisonRunIds, experimentId]
  )
  const baseline = experiment
    ? experimentBaseline({
        experiment,
        briefBaseline: brief.loaded ? (brief.brief?.baseline ?? null) : undefined,
        runs: allRuns,
        checked,
        storedBaselineId: document?.baselineRunId ?? null
      })
    : null
  const baselineRun = baseline?.run ?? null
  const compared = useMemo(
    () => experimentComparedRuns(checked, baselineRun),
    [checked, baselineRun]
  )
  const compare = useComparedRunEntries(compared, page === 'compare')
  const packet = useMemo(
    () => contextPacket(compare.entries, baselineRun?.id ?? null),
    [compare.entries, baselineRun]
  )
  const needsYou = useMemo(
    () =>
      experimentNeedsYou({
        runs,
        statusOf,
        findings: findings.findings,
        proposals: proposals.proposals,
        dismissedRuns: dismissedRuns.dismissed
      }),
    [runs, statusOf, findings.findings, proposals.proposals, dismissedRuns.dismissed]
  )

  const metricDecimals = useMemo(
    () => primaryMetricDecimals(runs.map(runSummaryOf(summaries.byRun))),
    [runs, summaries.byRun]
  )

  const experimentName = (id: string): string =>
    document?.experiments.find((entry) => entry.id === id)?.name ?? 'another Experiment'
  const runLabel = (run: ResearchRunRecord): string =>
    run.experimentId === experimentId
      ? run.name
      : `${run.name} (${experimentName(run.experimentId)})`

  async function update(change: (current: ResearchDocument) => ResearchDocument): Promise<void> {
    try {
      await useResearchRecords.getState().update(change)
    } catch {
      // The store keeps the save failure visible.
    }
  }

  async function organizeQuietly(): Promise<number | null> {
    const organize = organizeBridge().organize
    if (!scope || !organize) {
      return null
    }
    const result = await organize({
      workspacePath: scope.workspacePath,
      experiment: scope.experiment
    })
    await Promise.all([summaries.refresh(), findings.refresh()])
    return result.organized
  }

  /** Brief changes move rule checks, and baseline or metric changes move every summary. */
  function afterBriefSaved(patch: ResearchExperimentBriefPatch): void {
    void findings.refresh()
    if ('baseline' in patch || 'primaryMetric' in patch) {
      void organizeQuietly().catch(() => undefined)
    }
  }

  const full = compared.length >= MAX_COMPARED_RUNS
  return {
    document,
    error,
    saving,
    experiment,
    runs,
    slug,
    scope,
    page,
    setPage,
    harness,
    findings,
    brief,
    proposals,
    decisions,
    summaries,
    analyses,
    attach,
    remoteHost,
    checked,
    baseline,
    compared,
    compare,
    packet,
    needsYou,
    /** Decimals of the primary metric, the same in every notebook row. */
    metricDecimals,
    statusOf,
    runLabel,
    full,
    choices: experiment && baseline ? baselineChoices(experiment, baseline, compared) : [],
    dismissRun: dismissedRuns.dismiss,
    afterBriefSaved,
    toggleComparison: (runId: string) =>
      void update((current) =>
        toggleExperimentComparison(
          current,
          runId,
          MAX_COMPARED_RUNS - (baselineRun && !checked.includes(baselineRun) ? 1 : 0)
        )
      ),
    detach: (runId: string) => void update((current) => detachResearchRun(current, runId)),
    openRun: (runId: string) => {
      setPage('runs')
      void update((current) => selectResearchRun(current, runId))
    },
    togglePage: () => {
      if (experimentId) {
        setPage(toggledExperimentPage(page, lastExperimentDetailPage(experimentId)))
      }
    },
    openAttach: () => {
      setPage('runs')
      if (!attach.adding || attach.formOwnerId !== experimentId) {
        attach.toggleAttachForm()
      }
    },
    chooseBaseline: async (choice: BaselineChoice): Promise<void> => {
      if (choice.reference) {
        await brief.update({ baseline: choice.reference })
        afterBriefSaved({ baseline: choice.reference })
        return
      }
      await useResearchRecords
        .getState()
        .update((current) =>
          current.comparisonRunIds.includes(choice.run.id)
            ? { ...current, baselineRunId: choice.run.id }
            : current
        )
    },
    /** Rereads run.json statuses and rule checks after the app changed a Run. */
    refreshRuns: async (): Promise<void> => {
      setHarnessReads((count) => count + 1)
      await findings.refresh()
    },
    organize:
      scope && organizeBridge().organize
        ? async (): Promise<void> => {
            try {
              const organized = await organizeQuietly()
              toast.success(
                organized
                  ? `Organized ${organized} ${organized === 1 ? 'Run' : 'Runs'}.`
                  : 'No Runs to organize.'
              )
            } catch (cause) {
              toast.error(`Couldn't organize results. ${researchErrorText(cause)}`)
            }
          }
        : null
  }
}

export type ExperimentWorkspace = ReturnType<typeof useExperimentWorkspace>
