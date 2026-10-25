import { z } from 'zod'
import {
  RESEARCH_EXPERIMENT_STATUSES,
  RESEARCH_PROPOSAL_POLICIES,
  RESEARCH_TRIAGE_POLICIES
} from '../../../../shared/research/research-experiment-brief'
import type { ResearchExperimentBriefForm } from './research-experiment-brief-form'

// Why only changed fields: restored onto the current brief, a draft never reverts what an agent
// wrote to fields the user did not touch.
const briefFormChangesSchema = z
  .object({
    question: z.string(),
    hypothesis: z.string(),
    status: z.enum(RESEARCH_EXPERIMENT_STATUSES),
    metricName: z.string(),
    metricSplit: z.string(),
    metricDirection: z.enum(['minimize', 'maximize']),
    datasetId: z.string(),
    datasetRevision: z.string(),
    evaluationSplit: z.string(),
    evaluatorRevision: z.string(),
    baseline: z.string(),
    minSeeds: z.string(),
    rubric: z.string(),
    triage: z.enum(RESEARCH_TRIAGE_POLICIES),
    proposals: z.enum(RESEARCH_PROPOSAL_POLICIES),
    conclusion: z.string()
  })
  .partial()
  .strip()

export type BriefFormChanges = z.infer<typeof briefFormChangesSchema>

/** The fields of `form` that differ from `base`. */
export function briefFormChanges(
  form: ResearchExperimentBriefForm,
  base: ResearchExperimentBriefForm
): BriefFormChanges {
  const changed = Object.entries(form).filter(([key, value]) => Reflect.get(base, key) !== value)
  return briefFormChangesSchema.parse(Object.fromEntries(changed))
}

/** `base` with a stored plan draft applied, or null when there is no usable change. */
export function restoreBriefForm(
  base: ResearchExperimentBriefForm,
  stored: unknown
): ResearchExperimentBriefForm | null {
  const parsed = z.object({ changes: briefFormChangesSchema }).safeParse(stored)
  if (!parsed.success) {
    return null
  }
  const form = { ...base, ...parsed.data.changes }
  return Object.keys(briefFormChanges(form, base)).length ? form : null
}

/** A stored conclusion draft's text, or null. */
export function storedConclusionDraft(stored: unknown): string | null {
  const parsed = z.object({ text: z.string() }).safeParse(stored)
  return parsed.success ? parsed.data.text : null
}
