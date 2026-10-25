import { z } from 'zod'
import { researchAgentIdentitySchema } from './research-quality-findings'

// Why catch: summary.json is written by the harness and may come from a newer version.
const nullableNumber = z.number().nullable().catch(null)
const pointSchema = z.object({ value: z.number(), step: nullableNumber }).nullable().catch(null)

/** The `runs/<id>/summary.json` the harness writes when a Run ends (plan C7). */
export const researchRunSummarySchema = z.object({
  run: z.string(),
  generatedAt: z.string(),
  state: z.string().catch('unknown'),
  exitCode: nullableNumber,
  durationMs: nullableNumber,
  primary: z
    .object({
      metric: z.string(),
      split: z.string().nullable().catch(null),
      direction: z.enum(['minimize', 'maximize']),
      last: pointSchema,
      best: pointSchema
    })
    .nullable()
    .catch(null),
  baseline: z
    .object({
      run: z.string(),
      last: pointSchema,
      best: pointSchema,
      delta: z.object({ last: nullableNumber, best: nullableNumber })
    })
    .nullable()
    .catch(null),
  findings: z
    .object({ fail: z.number(), warn: z.number(), info: z.number() })
    .catch({ fail: 0, warn: 0, info: 0 }),
  media: z
    .object({ image: z.number(), video: z.number(), audio: z.number() })
    .catch({ image: 0, video: 0, audio: 0 }),
  outputs: z.object({ samples: z.number() }).nullable().catch(null),
  notes: z
    .array(
      z.object({
        at: z.string(),
        text: z.string(),
        by: z.enum(['agent', 'user']).catch('agent'),
        agent: researchAgentIdentitySchema.optional()
      })
    )
    .catch([])
})
export type ResearchRunSummary = z.infer<typeof researchRunSummarySchema>

/** Summaries of an Experiment's catalog Runs; `summary` is null until the Run is organized. */
export const researchRunSummaryListSchema = z.object({
  runs: z.array(z.object({ run: z.string(), summary: researchRunSummarySchema.nullable() }))
})
export type ResearchRunSummaryList = z.infer<typeof researchRunSummaryListSchema>
