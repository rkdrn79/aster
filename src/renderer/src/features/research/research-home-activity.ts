import type {
  ExperimentRecord,
  ResearchRunRecord
} from '../../../../shared/research/research-records'
import { effectiveRunStatusFacts, type ResearchRunStatusFacts } from './research-run-status-label'

type ActivityProject = { key: string; workspaces: readonly { id: string }[] }

/** What a project card says about a project's research, from the saved research records. */
export type ResearchHomeActivity = {
  experiments: number
  /** Runs whose launcher is alive, or not known to have exited. */
  running: number
  /** Runs recorded as running whose launcher exited: nobody will record how they ended. */
  stalled: number
  /** Failed Runs the notebook still lists under Needs you. */
  failed: number
  /** Latest Experiment or Run change, else the last visit; 0 when neither is known. */
  lastActivityAt: number
}

export type ResearchHomeActivityInputs = {
  projects: readonly (ActivityProject & { lastVisitedAt: number })[]
  experiments: readonly ExperimentRecord[]
  runs: readonly ResearchRunRecord[]
  /** run.json facts by Run id; read only for local Experiments with a running or failed Run. */
  live: ReadonlyMap<string, ResearchRunStatusFacts>
  /** `run.failed` finding status by Run id, when the harness recorded one. */
  failedFindings: ReadonlyMap<string, 'open' | 'closed'>
  /** `run:<id>` keys the user dismissed from Needs you, per Experiment id. */
  dismissedRuns: (experimentId: string) => ReadonlySet<string>
}

export function emptyResearchHomeActivity(lastVisitedAt = 0): ResearchHomeActivity {
  return { experiments: 0, running: 0, stalled: 0, failed: 0, lastActivityAt: lastVisitedAt }
}

export function researchHomeNeedsYou(activity: ResearchHomeActivity): number {
  return activity.stalled + activity.failed
}

/** The project an Experiment belongs to: its workspace first, then its recorded project id. */
export function researchHomeProjectKey(
  experiment: Pick<ExperimentRecord, 'workspaceId' | 'projectId'>,
  projects: readonly ActivityProject[]
): string | null {
  const byWorkspace = projects.find((project) =>
    project.workspaces.some((workspace) => workspace.id === experiment.workspaceId)
  )
  if (byWorkspace) {
    return byWorkspace.key
  }
  const projectKey = experiment.projectId ? `project:${experiment.projectId}` : null
  return projects.some((project) => project.key === projectKey) ? projectKey : null
}

function timestamp(value: string | null | undefined): number {
  const parsed = value ? Date.parse(value) : Number.NaN
  return Number.isFinite(parsed) ? parsed : 0
}

/** Per-project counts for the home cards, keyed by project key. */
export function summarizeResearchHomeActivity(
  inputs: ResearchHomeActivityInputs
): Map<string, ResearchHomeActivity> {
  const result = new Map(
    inputs.projects.map((project) => [
      project.key,
      emptyResearchHomeActivity(project.lastVisitedAt)
    ])
  )
  const owners = new Map<string, ResearchHomeActivity>()
  for (const experiment of inputs.experiments) {
    const key = experiment.archived ? null : researchHomeProjectKey(experiment, inputs.projects)
    const activity = key ? result.get(key) : undefined
    if (!activity) {
      continue
    }
    owners.set(experiment.id, activity)
    activity.experiments += 1
    activity.lastActivityAt = Math.max(activity.lastActivityAt, timestamp(experiment.updatedAt))
  }
  for (const run of inputs.runs) {
    const activity = owners.get(run.experimentId)
    if (!activity) {
      continue
    }
    activity.lastActivityAt = Math.max(
      activity.lastActivityAt,
      timestamp(run.createdAt),
      timestamp(run.observedAt)
    )
    const facts = effectiveRunStatusFacts(run, inputs.live.get(run.id))
    if (facts.state === 'running') {
      if (facts.liveness === 'exited') {
        activity.stalled += 1
      } else {
        activity.running += 1
      }
    } else if (facts.state === 'failed') {
      // Same rule as the notebook: a recorded finding decides, else the user's dismissal.
      const finding = inputs.failedFindings.get(run.id)
      const listed = finding
        ? finding === 'open'
        : !inputs.dismissedRuns(run.experimentId).has(`run:${run.id}`)
      if (listed) {
        activity.failed += 1
      }
    }
  }
  return result
}
