import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import {
  RESEARCH_PAIRWISE_VERDICTS,
  RESEARCH_SINGLE_VERDICTS,
  researchSampleRatingListSchema,
  researchSampleRatingSchema,
  researchSampleRatingSummarySchema,
  type ResearchSampleRating,
  type ResearchSampleRatingSummary
} from '../../shared/research/research-sample-ratings'
import { containedProjectFile } from './research-claims-audit'
import { authorizedProjectPath, callHarness, handle } from './research-harness-ipc'

const EXPERIMENT_SLUG = /^[\p{L}\p{N}][\p{L}\p{N}-]{0,63}$/u
const MAX_RUBRIC_BYTES = 1024 * 1024

const runReference = z.string().trim().min(3).max(160)
const experimentSchema = z
  .object({
    workspacePath: z.string().min(1).max(4096),
    experiment: z.string().regex(EXPERIMENT_SLUG)
  })
  .strict()
const listSchema = experimentSchema.extend({
  run: runReference.optional(),
  against: runReference.optional(),
  by: z.enum(['user', 'agent']).optional()
})
const addSchema = experimentSchema.extend({
  sampleId: z.string().min(1).max(256),
  run: runReference,
  against: runReference.nullable(),
  verdict: z.enum([...RESEARCH_SINGLE_VERDICTS, ...RESEARCH_PAIRWISE_VERDICTS]),
  tags: z.array(z.string().max(40)).max(8),
  note: z.string().max(2000).nullable(),
  blind: z.boolean()
})
const summarySchema = experimentSchema.extend({
  run: runReference,
  against: runReference.nullable()
})
const rubricSchema = z
  .object({ workspacePath: z.string().min(1).max(4096), path: z.string().min(1).max(4096) })
  .strict()
const addedSchema = z.object({ rating: researchSampleRatingSchema })

async function readRubric(
  workspacePath: string,
  relativePath: string
): Promise<{ path: string; content: string; sha256: string } | null> {
  const project = await authorizedProjectPath(workspacePath)
  let file: string
  try {
    file = await containedProjectFile(project, relativePath)
  } catch (cause) {
    const code = typeof cause === 'object' && cause !== null ? Reflect.get(cause, 'code') : null
    if (code === 'ENOENT') {
      return null
    }
    throw cause
  }
  if ((await stat(file)).size > MAX_RUBRIC_BYTES) {
    throw new Error('The rubric is larger than 1 MiB.')
  }
  const bytes = await readFile(file)
  return {
    path: path.relative(project, file).split(path.sep).join('/'),
    content: bytes.toString('utf8'),
    sha256: createHash('sha256').update(bytes).digest('hex')
  }
}

/** Local catalog projects only; a rating from the app is always the user's. */
export function registerResearchRatingsIpcHandlers(): void {
  handle('researchRatings:list', listSchema, async (input) =>
    researchSampleRatingListSchema.parse(
      await callHarness(
        'research-ratings.mjs',
        'listRatings',
        await authorizedProjectPath(input.workspacePath),
        {
          experiment: input.experiment,
          run: input.run ?? null,
          against: input.against ?? null,
          by: input.by ?? null
        }
      )
    )
  )
  handle(
    'researchRatings:add',
    addSchema,
    async (input): Promise<{ rating: ResearchSampleRating }> => {
      const { rating } = addedSchema.parse(
        await callHarness(
          'research-ratings.mjs',
          'addRating',
          await authorizedProjectPath(input.workspacePath),
          {
            experiment: input.experiment,
            sampleId: input.sampleId,
            run: input.run,
            against: input.against,
            verdict: input.verdict,
            tags: input.tags,
            note: input.note,
            blind: input.blind,
            by: 'user'
          },
          // Why: the app's own environment may be an agent's shell; a click is always the user's.
          { env: {} }
        )
      )
      return { rating }
    }
  )
  handle(
    'researchRatings:summary',
    summarySchema,
    async (input): Promise<ResearchSampleRatingSummary> =>
      researchSampleRatingSummarySchema.parse(
        await callHarness(
          'research-ratings.mjs',
          'summarizeRatings',
          await authorizedProjectPath(input.workspacePath),
          { experiment: input.experiment, run: input.run, against: input.against }
        )
      )
  )
  handle('researchRatings:rubric', rubricSchema, async (input) =>
    readRubric(input.workspacePath, input.path)
  )
}
