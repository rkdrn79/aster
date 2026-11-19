import { z } from 'zod'

// Why catch: these mirror the research harness's writing results; a newer harness must not break
// the Writing page.
const nullableText = z.string().nullable().catch(null)
const nullableNumber = z.number().nullable().catch(null)
const count = z.number().catch(0)

/** Sections the person confirms a five-line skeleton for, in the order the card offers them. */
export const WRITING_SKELETON_SECTIONS = [
  'intro',
  'method',
  'experiments',
  'abstract',
  'related'
] as const
export type WritingSkeletonSection = (typeof WRITING_SKELETON_SECTIONS)[number]

/** The five required lines, in order. */
export const WRITING_SKELETON_REQUIRED_LINES = [
  'GAP',
  'WHY-NOT',
  'INSIGHT',
  'APPROACH',
  'EVIDENCE'
] as const

export const WRITING_SECTION_ROLES = [
  'abstract',
  'intro',
  'related',
  'background',
  'method',
  'experiments',
  'conclusion',
  'appendix',
  'body'
] as const
export type WritingSectionRole = (typeof WRITING_SECTION_ROLES)[number]

export const writingFindingSchema = z.object({
  code: z.string(),
  id: nullableText.optional().transform((value) => value ?? null),
  message: z.string(),
  fix: nullableText.optional().transform((value) => value ?? null),
  file: z.string(),
  line: z.number().int().min(1).catch(1),
  column: nullableNumber.optional().transform((value) => value ?? null),
  span: nullableText.optional().transform((value) => value ?? null),
  paragraph: nullableNumber.optional().transform((value) => value ?? null)
})
export type WritingFinding = z.infer<typeof writingFindingSchema>

const findingList = z.array(writingFindingSchema).catch([])

export const writingCheckSectionSchema = z.object({
  role: z.enum(WRITING_SECTION_ROLES).catch('body'),
  title: z.string().catch(''),
  file: z.string(),
  line: z.number().int().catch(1),
  endLine: z.number().int().catch(1),
  profile: z
    .object({
      words: count,
      paragraphs: count,
      sentences: count,
      citesPer100Words: count,
      refsPer1kWords: count,
      hedgesPer1kWords: count,
      passiveShare: count,
      wePer1kWords: count
    })
    .partial()
    .catch({}),
  score: nullableNumber,
  errors: findingList,
  warnings: findingList,
  notes: findingList
})
export type WritingCheckSection = z.infer<typeof writingCheckSectionSchema>

export const writingCheckResultSchema = z.object({
  manuscript: z.string(),
  files: z.array(z.string()).catch([]),
  fragment: z.boolean().catch(false),
  bibliography: z
    .object({ files: z.array(z.string()).catch([]), keys: count })
    .nullable()
    .catch(null),
  claims: z
    .object({ ledger: z.boolean().catch(false), claims: count })
    .nullable()
    .catch(null),
  summary: z.object({ errors: count, warnings: count, notes: count }),
  sections: z.array(writingCheckSectionSchema).catch([])
})
export type WritingCheckResult = z.infer<typeof writingCheckResultSchema>

export const writingSkeletonLineSchema = z.object({
  key: z.string(),
  text: z.string().catch(''),
  required: z.boolean().catch(false)
})
export type WritingSkeletonLine = z.infer<typeof writingSkeletonLineSchema>

export const writingSkeletonSchema = z.object({
  section: z.string(),
  path: z.string(),
  status: z.enum(['missing', 'draft', 'confirmed']).catch('draft'),
  lines: z.array(writingSkeletonLineSchema).catch([]),
  missing: z.array(z.string()).catch([]),
  notes: z.string().catch(''),
  updatedAt: nullableText.optional().transform((value) => value ?? null),
  updatedBy: nullableText.optional().transform((value) => value ?? null),
  confirmedAt: nullableText.optional().transform((value) => value ?? null),
  confirmedBy: nullableText.optional().transform((value) => value ?? null)
})
export type WritingSkeleton = z.infer<typeof writingSkeletonSchema>

export const writingSkeletonListSchema = z.object({
  skeletons: z.array(writingSkeletonSchema).catch([])
})

export const writingCodeFoldersSchema = z.object({
  folders: z.array(z.object({ path: z.string(), files: count, lines: count })).catch([])
})
export type WritingCodeFolder = z.infer<typeof writingCodeFoldersSchema>['folders'][number]
