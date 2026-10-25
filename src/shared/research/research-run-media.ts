import { z } from 'zod'

// Why catch: these mirror the research harness's JSON results; a newer harness must not break the UI.
const nullableText = z.string().nullable().catch(null)
const nullableNumber = z.number().nullable().catch(null)

export const RESEARCH_MEDIA_KINDS = ['image', 'video', 'audio'] as const
export type ResearchMediaKind = (typeof RESEARCH_MEDIA_KINDS)[number]

/** One media file of a Run (plan C6); `path` is project-relative with `/` separators. */
export const researchRunMediaItemSchema = z.object({
  kind: z.enum(RESEARCH_MEDIA_KINDS),
  path: z.string(),
  step: nullableNumber,
  label: nullableText,
  sampleId: nullableText,
  bytes: nullableNumber,
  source: z.enum(['exec', 'attach', 'outputs', 'scan']).catch('scan')
})
export type ResearchRunMediaItem = z.infer<typeof researchRunMediaItemSchema>

export const researchRunMediaIndexSchema = z.object({
  run: z.string(),
  // Why per-item catch: one item a newer harness shapes differently must not hide the rest.
  items: z.array(researchRunMediaItemSchema.nullable().catch(null)).catch([]),
  truncated: z.boolean().catch(false)
})
export type ResearchRunMediaIndex = z.infer<typeof researchRunMediaIndexSchema>
