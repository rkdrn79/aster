import type {
  ExperimentRecord,
  ResearchRunRecord
} from '../../../../shared/research/research-records'
import type { SampleJudgeRun } from './research-sample-judge-prompt'
import { catalogRunReference, harnessExperimentSlug } from './use-research-harness-experiment'

/** A Run the harness can rate: a local research/ catalog Run. */
export type RatableRun = { run: ResearchRunRecord; ref: string; experiment: string }

/** Catalog Runs in one project, the baseline's when it is one, since a ledger is per project. */
export function ratableRuns(
  runs: ResearchRunRecord[],
  experiments: readonly ExperimentRecord[],
  anchorId: string | null
): RatableRun[] {
  const entries = runs.flatMap((run): RatableRun[] => {
    const ref = catalogRunReference(run)
    const slug = harnessExperimentSlug(
      experiments.find((experiment) => experiment.id === run.experimentId)
    )
    return ref && slug ? [{ run, ref, experiment: ref.slice(0, ref.indexOf('/')) }] : []
  })
  const anchor = entries.find((entry) => entry.run.id === anchorId) ?? entries[0]
  return anchor
    ? entries.filter((entry) => entry.run.workspacePath === anchor.run.workspacePath)
    : []
}

export function judgeRun({ run, ref, experiment }: RatableRun): SampleJudgeRun {
  return { ref, experiment, name: run.name, outputsPath: run.outputsPath ?? null }
}
