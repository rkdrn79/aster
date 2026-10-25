import { z } from 'zod'
import { researchAgentIdentitySchema } from './research-quality-findings'

// Why catch: these mirror the research harness's JSON results; a newer harness must not break the UI.
const nullableText = z.string().nullable().catch(null)

export const RESEARCH_SINGLE_VERDICTS = ['good', 'bad', 'unsure'] as const
export const RESEARCH_PAIRWISE_VERDICTS = ['a', 'b', 'tie'] as const
export type ResearchSingleVerdict = (typeof RESEARCH_SINGLE_VERDICTS)[number]
export type ResearchPairwiseVerdict = (typeof RESEARCH_PAIRWISE_VERDICTS)[number]

/** One sample judgment by a person or an agent judge (plan C5). */
export const researchSampleRatingSchema = z.object({
  id: z.string(),
  at: z.string(),
  sampleId: z.string(),
  mode: z.enum(['single', 'pairwise']),
  run: z.string(),
  against: nullableText,
  verdict: z.enum([...RESEARCH_SINGLE_VERDICTS, ...RESEARCH_PAIRWISE_VERDICTS]),
  tags: z.array(z.string()).catch([]),
  note: nullableText,
  by: z.enum(['user', 'agent']),
  blind: z.boolean().catch(false),
  rubric: z.object({ path: z.string(), sha256: z.string() }).nullable().catch(null),
  judge: z
    .object({ provider: nullableText, model: z.string(), promptSha256: nullableText })
    .nullable()
    .catch(null),
  agent: researchAgentIdentitySchema.optional()
})
export type ResearchSampleRating = z.infer<typeof researchSampleRatingSchema>

export const researchSampleRatingListSchema = z.object({
  ratings: z.array(researchSampleRatingSchema)
})

const pairwiseCountsSchema = z
  .object({ wins: z.number(), losses: z.number(), ties: z.number(), n: z.number() })
  .nullable()
  .catch(null)
const singleCountsSchema = z
  .object({ good: z.number(), bad: z.number(), unsure: z.number(), n: z.number() })
  .nullable()
  .catch(null)
const sourceCountsSchema = z.object({ pairwise: pairwiseCountsSchema, single: singleCountsSchema })

/** `wins`/`losses` are from `run`'s side against `against`. */
export const researchSampleRatingSummarySchema = z.object({
  run: z.string(),
  against: nullableText,
  pairwise: pairwiseCountsSchema,
  single: singleCountsSchema,
  bySource: z.object({ user: sourceCountsSchema, agent: sourceCountsSchema }),
  agreement: z
    .object({ overlap: z.number(), agreeing: z.number(), rate: z.number().nullable() })
    .nullable()
    .catch(null),
  judges: z
    .array(
      z.object({
        provider: nullableText,
        model: z.string(),
        promptSha256: nullableText,
        rubricSha256: nullableText,
        n: z.number()
      })
    )
    .catch([]),
  judgeMixed: z.boolean().catch(false),
  tags: z.record(z.string(), z.number()).catch({})
})
export type ResearchSampleRatingSummary = z.infer<typeof researchSampleRatingSummarySchema>
