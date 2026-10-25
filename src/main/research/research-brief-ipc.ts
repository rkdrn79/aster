import { z } from 'zod'
import {
  RESEARCH_EXPERIMENT_STATUSES,
  RESEARCH_PROPOSAL_POLICIES,
  RESEARCH_TRIAGE_POLICIES,
  researchExperimentBriefResultSchema,
  type ResearchExperimentBriefResult
} from '../../shared/research/research-experiment-brief'
import {
  researchCheckResultSchema,
  type ResearchCheckResult
} from '../../shared/research/research-quality-findings'
import { authorizedProjectPath, callHarness, handle } from './research-harness-ipc'

const BRIEF_MODULE = 'research-experiment-brief.mjs'
// Same limits as the harness, so a refused request never reaches experiment.json.
const EXPERIMENT_SLUG = /^[\p{L}\p{N}][\p{L}\p{N}-]{0,63}$/u
const text = z.string().max(4000).nullable().optional()
const name = z.string().max(200)

const experimentSchema = z
  .object({
    workspacePath: z.string().min(1).max(4096),
    experiment: z.string().regex(EXPERIMENT_SLUG)
  })
  .strict()
const patchSchema = z
  .object({
    question: text,
    hypothesis: text,
    status: z.enum(RESEARCH_EXPERIMENT_STATUSES).nullable().optional(),
    primaryMetric: z
      .object({
        name: name.min(1),
        split: name.nullable(),
        direction: z.enum(['minimize', 'maximize'])
      })
      .strict()
      .nullable()
      .optional(),
    evaluation: z
      .object({
        datasetId: name.min(1),
        datasetRevision: name.nullable(),
        split: name.nullable(),
        evaluatorRevision: name.nullable()
      })
      .strict()
      .nullable()
      .optional(),
    baseline: z.string().max(160).nullable().optional(),
    minSeeds: z.number().int().min(1).max(20).nullable().optional(),
    rubric: z.string().max(4096).nullable().optional(),
    agentPolicy: z
      .object({
        triage: z.enum(RESEARCH_TRIAGE_POLICIES),
        proposals: z.enum(RESEARCH_PROPOSAL_POLICIES)
      })
      .strict()
      .nullable()
      .optional(),
    conclusion: text
  })
  .strict()
const updateSchema = experimentSchema.extend({ patch: patchSchema }).strict()
const checkSchema = experimentSchema
  .extend({ run: z.string().trim().min(1).max(160).optional() })
  .strict()

/** The app edits briefs only as the user; agents use `brief set` in the harness CLI. */
export function registerResearchBriefIpcHandlers(): void {
  handle(
    'researchBrief:show',
    experimentSchema,
    async (input): Promise<ResearchExperimentBriefResult> => {
      const project = await authorizedProjectPath(input.workspacePath)
      return researchExperimentBriefResultSchema.parse({
        experiment: input.experiment,
        brief: await callHarness(BRIEF_MODULE, 'readExperimentBrief', project, input.experiment)
      })
    }
  )
  handle(
    'researchBrief:update',
    updateSchema,
    async (input): Promise<ResearchExperimentBriefResult> =>
      researchExperimentBriefResultSchema.parse(
        await callHarness(
          BRIEF_MODULE,
          'updateExperimentBrief',
          await authorizedProjectPath(input.workspacePath),
          input.experiment,
          input.patch,
          { by: 'user' }
        )
      )
  )
  handle('researchBrief:check', checkSchema, async (input): Promise<ResearchCheckResult> =>
    researchCheckResultSchema.parse(
      await callHarness(
        'research-checks.mjs',
        'runChecks',
        await authorizedProjectPath(input.workspacePath),
        { experiment: input.experiment, run: input.run ?? null }
      )
    )
  )
}
