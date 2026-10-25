import { z } from 'zod'

const relativeTransferPathSchema = z
  .string()
  .trim()
  .min(1)
  .max(4096)
  .refine(
    (value) =>
      !value.startsWith('/') &&
      !value.includes('\\') &&
      !value.includes('\0') &&
      value
        .split('/')
        .every((segment) => segment.length > 0 && segment !== '.' && segment !== '..'),
    'Choose relative files or folders inside the project, using / separators'
  )

export const researchProjectTransferRequestSchema = z
  .object({
    linkId: z.string().uuid(),
    localRoot: z.string().min(1).max(4096),
    direction: z.enum(['push', 'pull']),
    paths: z.array(relativeTransferPathSchema).min(1).max(30)
  })
  .strict()
  .refine((value) => new Set(value.paths).size === value.paths.length, 'Duplicate path')

export type ResearchProjectTransferRequest = z.infer<typeof researchProjectTransferRequestSchema>

export type ResearchProjectTransferPreview = {
  direction: 'push' | 'pull'
  hostLabel: string
  sourceRoot: string
  destinationRoot: string
  files: number
  bytes: number
  paths: string[]
  truncated: boolean
  skipped: string[]
  skippedCount: number
}

export type ResearchProjectTransferResult = {
  destinationPath: string
  files: number
  bytes: number
  completedAt: string
}
