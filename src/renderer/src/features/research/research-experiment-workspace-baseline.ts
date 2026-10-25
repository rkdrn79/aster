import type {
  ExperimentRecord,
  ResearchRunRecord
} from '../../../../shared/research/research-records'
import { catalogRunReference, harnessExperimentSlug } from './use-research-harness-experiment'

/** The one Run that Compare, A/B rating, rule checks, and agent reviews measure against. */
export type ExperimentBaseline = {
  /** Catalog Experiments keep it in the brief; other Experiments keep the stored Compare choice. */
  source: 'brief' | 'stored'
  /** The brief's `<experiment>/<run>`; null for a stored baseline or when the brief names none. */
  reference: string | null
  /** The baseline's Run record when Aster has it attached; it may belong to another Experiment. */
  run: ResearchRunRecord | null
  /** The brief has not been read yet. */
  pending: boolean
}

type BaselineRun = Pick<
  ResearchRunRecord,
  'id' | 'experimentId' | 'hostId' | 'workspacePath' | 'manifestPath'
>

/** The attached Run a catalog reference names in this Experiment's project, its own Runs first. */
export function catalogRunForReference<Run extends BaselineRun>(
  experiment: Pick<ExperimentRecord, 'id' | 'hostId' | 'workspacePath'>,
  runs: readonly Run[],
  reference: string
): Run | null {
  const matches = runs.filter(
    (run) =>
      run.hostId === experiment.hostId &&
      run.workspacePath === experiment.workspacePath &&
      catalogRunReference(run) === reference
  )
  return matches.find((run) => run.experimentId === experiment.id) ?? matches[0] ?? null
}

/**
 * The brief's baseline for a local catalog Experiment (`undefined` while the brief is unread);
 * when the brief names none, or outside the catalog, the stored Compare baseline when checked,
 * else the first checked Run.
 */
export function experimentBaseline(input: {
  experiment: ExperimentRecord
  briefBaseline: string | null | undefined
  runs: readonly ResearchRunRecord[]
  checked: readonly ResearchRunRecord[]
  storedBaselineId: string | null
}): ExperimentBaseline {
  const { experiment, briefBaseline, checked } = input
  if (harnessExperimentSlug(experiment) && briefBaseline !== null) {
    return {
      source: 'brief',
      reference: briefBaseline ?? null,
      run: briefBaseline ? catalogRunForReference(experiment, input.runs, briefBaseline) : null,
      pending: briefBaseline === undefined
    }
  }
  return {
    source: 'stored',
    reference: null,
    run: checked.find((run) => run.id === input.storedBaselineId) ?? checked[0] ?? null,
    pending: false
  }
}

/** The baseline first, then the checked Runs. */
export function experimentComparedRuns(
  checked: readonly ResearchRunRecord[],
  baseline: ResearchRunRecord | null
): ResearchRunRecord[] {
  return baseline ? [baseline, ...checked.filter((run) => run.id !== baseline.id)] : [...checked]
}

export type BaselineChoice = { run: ResearchRunRecord; reference: string | null }

/** Compared Runs that can become the baseline: catalog Runs of this project when the brief holds it. */
export function baselineChoices(
  experiment: ExperimentRecord,
  baseline: ExperimentBaseline,
  compared: readonly ResearchRunRecord[]
): BaselineChoice[] {
  const briefReference = (run: ResearchRunRecord): string | null => {
    const reference = harnessExperimentSlug(experiment) ? catalogRunReference(run) : null
    return reference &&
      run.hostId === experiment.hostId &&
      run.workspacePath === experiment.workspacePath
      ? reference
      : null
  }
  if (baseline.source === 'stored') {
    // Why: a catalog Run chosen here becomes the brief's baseline; an attached file stays local.
    return compared.map((run) => ({ run, reference: briefReference(run) }))
  }
  return compared.flatMap((run) => {
    const reference = briefReference(run)
    return reference ? [{ run, reference }] : []
  })
}
