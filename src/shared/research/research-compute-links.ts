import { z } from 'zod'

/** A folder on an SSH host that belongs to a project, for hosts Aster has no workspace on. */
export const researchComputeLinkSchema = z
  .object({
    id: z.string().uuid(),
    targetId: z.string().min(1).max(512),
    remotePath: z
      .string()
      .min(2)
      .max(4096)
      .refine((path) => path.startsWith('/') && !/[\0\t\n\r]/.test(path)),
    /** Aster project whose name and color the link follows; null for a name typed here. */
    projectId: z.string().min(1).max(256).nullable(),
    projectName: z.string().trim().min(1).max(120),
    createdAt: z.string()
  })
  .strict()

export const researchComputeLinksDocumentSchema = z
  .object({
    schemaVersion: z.literal(1),
    revision: z.number().int().nonnegative().optional(),
    links: z.array(researchComputeLinkSchema).max(500)
  })
  .strict()

export type ResearchComputeLink = z.infer<typeof researchComputeLinkSchema>
export type ResearchComputeLinksDocument = z.infer<typeof researchComputeLinksDocumentSchema>

export function emptyResearchComputeLinksDocument(): ResearchComputeLinksDocument {
  return { schemaVersion: 1, revision: 0, links: [] }
}
