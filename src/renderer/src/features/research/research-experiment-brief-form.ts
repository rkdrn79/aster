import {
  DEFAULT_RESEARCH_AGENT_POLICY,
  type ResearchExperimentBrief,
  type ResearchExperimentBriefPatch,
  type ResearchExperimentStatus,
  type ResearchProposalPolicy,
  type ResearchTriagePolicy
} from '../../../../shared/research/research-experiment-brief'
import type {
  ExperimentRecord,
  ResearchRunRecord
} from '../../../../shared/research/research-records'
import { catalogRunReference } from './use-research-harness-experiment'

export type BriefBaselineChoice = { reference: string; name: string }

/**
 * Catalog Runs of the Experiment's project that the brief can name as its baseline: its own Runs
 * first, then other Experiments' Runs labeled with their Experiment.
 */
export function briefBaselineChoices(
  experiment: ExperimentRecord,
  experiments: readonly ExperimentRecord[],
  runs: readonly ResearchRunRecord[]
): BriefBaselineChoice[] {
  const experimentName = new Map(experiments.map((entry) => [entry.id, entry.name]))
  const choices = runs.flatMap((run): (BriefBaselineChoice & { own: boolean })[] => {
    const reference = catalogRunReference(run)
    if (
      !reference ||
      run.hostId !== experiment.hostId ||
      run.workspacePath !== experiment.workspacePath
    ) {
      return []
    }
    const own = run.experimentId === experiment.id
    const owner = experimentName.get(run.experimentId)
    return [{ reference, name: own || !owner ? run.name : `${owner} / ${run.name}`, own }]
  })
  const unique = [...new Map(choices.map((choice) => [choice.reference, choice])).values()]
  return unique
    .toSorted((left, right) => Number(right.own) - Number(left.own))
    .map(({ reference, name }) => ({ reference, name }))
}

export const BRIEF_STATUS_LABELS: Record<ResearchExperimentStatus, string> = {
  planned: 'Planned',
  running: 'Running',
  analyzing: 'Analyzing',
  concluded: 'Concluded',
  abandoned: 'Abandoned'
}
export const BRIEF_TRIAGE_LABELS: Record<ResearchTriagePolicy, string> = {
  off: 'Off',
  suggest: 'Offer on failures',
  auto: 'Watch running Runs'
}
export const BRIEF_PROPOSAL_LABELS: Record<ResearchProposalPolicy, string> = {
  off: 'Off',
  approval: 'Need my approval',
  budgeted: 'Within the loop budget'
}

export type ResearchExperimentBriefForm = {
  question: string
  hypothesis: string
  status: ResearchExperimentStatus
  metricName: string
  metricSplit: string
  metricDirection: 'minimize' | 'maximize'
  datasetId: string
  datasetRevision: string
  evaluationSplit: string
  evaluatorRevision: string
  /** `<experiment>/<run>`, or empty for none. */
  baseline: string
  minSeeds: string
  rubric: string
  triage: ResearchTriagePolicy
  proposals: ResearchProposalPolicy
  conclusion: string
}

type BriefContent = Omit<ResearchExperimentBrief, 'updatedAt' | 'updatedBy'>

const EMPTY_BRIEF: BriefContent = {
  question: null,
  hypothesis: null,
  status: 'planned',
  primaryMetric: null,
  evaluation: null,
  baseline: null,
  minSeeds: null,
  rubric: null,
  agentPolicy: { ...DEFAULT_RESEARCH_AGENT_POLICY },
  conclusion: null
}

const BRIEF_KEYS = [
  'question',
  'hypothesis',
  'status',
  'primaryMetric',
  'evaluation',
  'baseline',
  'minSeeds',
  'rubric',
  'agentPolicy',
  'conclusion'
] as const satisfies readonly (keyof BriefContent)[]

/** Nothing a check or review could use is written yet. */
export function briefIsEmpty(brief: ResearchExperimentBrief | null): boolean {
  return (
    !brief ||
    (!brief.question &&
      !brief.hypothesis &&
      !brief.primaryMetric &&
      !brief.evaluation &&
      !brief.baseline &&
      brief.minSeeds === null &&
      !brief.rubric &&
      !brief.conclusion &&
      brief.status === 'planned')
  )
}

export function briefForm(brief: ResearchExperimentBrief | null): ResearchExperimentBriefForm {
  const current = brief ?? EMPTY_BRIEF
  return {
    question: current.question ?? '',
    hypothesis: current.hypothesis ?? '',
    status: current.status,
    metricName: current.primaryMetric?.name ?? '',
    metricSplit: current.primaryMetric?.split ?? '',
    metricDirection: current.primaryMetric?.direction ?? 'maximize',
    datasetId: current.evaluation?.datasetId ?? '',
    datasetRevision: current.evaluation?.datasetRevision ?? '',
    evaluationSplit: current.evaluation?.split ?? '',
    evaluatorRevision: current.evaluation?.evaluatorRevision ?? '',
    baseline: current.baseline ?? '',
    minSeeds: current.minSeeds === null ? '' : String(current.minSeeds),
    rubric: current.rubric ?? '',
    triage: current.agentPolicy.triage,
    proposals: current.agentPolicy.proposals,
    conclusion: current.conclusion ?? ''
  }
}

function text(value: string): string | null {
  return value.trim() || null
}

function formContent(form: ResearchExperimentBriefForm): BriefContent | { error: string } {
  const evaluationDetails = [form.datasetRevision, form.evaluationSplit, form.evaluatorRevision]
  if (!text(form.datasetId) && evaluationDetails.some(text)) {
    return { error: 'Add a dataset ID for the evaluation details.' }
  }
  const seeds = form.minSeeds.trim() ? Number(form.minSeeds) : null
  if (seeds !== null && !(Number.isInteger(seeds) && seeds >= 1 && seeds <= 20)) {
    return { error: 'Min seeds must be a whole number from 1 to 20.' }
  }
  const metricName = text(form.metricName)
  const datasetId = text(form.datasetId)
  return {
    question: text(form.question),
    hypothesis: text(form.hypothesis),
    status: form.status,
    primaryMetric: metricName
      ? { name: metricName, split: text(form.metricSplit), direction: form.metricDirection }
      : null,
    evaluation: datasetId
      ? {
          datasetId,
          datasetRevision: text(form.datasetRevision),
          split: text(form.evaluationSplit),
          evaluatorRevision: text(form.evaluatorRevision)
        }
      : null,
    baseline: text(form.baseline),
    minSeeds: seeds,
    rubric: text(form.rubric),
    agentPolicy: { triage: form.triage, proposals: form.proposals },
    conclusion: text(form.conclusion)
  }
}

/**
 * Only the fields the user changed, so a save never overwrites what an agent wrote to other
 * fields in the meantime.
 */
export function briefFormPatch(
  form: ResearchExperimentBriefForm,
  brief: ResearchExperimentBrief | null
): { patch: ResearchExperimentBriefPatch } | { error: string } {
  const next = formContent(form)
  if ('error' in next) {
    return next
  }
  const current = brief ?? EMPTY_BRIEF
  const patch: ResearchExperimentBriefPatch = {}
  const compare = <Key extends keyof BriefContent>(key: Key): void => {
    if (JSON.stringify(next[key]) !== JSON.stringify(current[key])) {
      patch[key] = next[key]
    }
  }
  BRIEF_KEYS.forEach(compare)
  return { patch }
}
