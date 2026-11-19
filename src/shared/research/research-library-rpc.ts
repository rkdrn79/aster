import { z } from 'zod'

// Params of the host's researchLibrary.* methods, which give a browser client the Library calls
// the desktop makes over IPC.

export const ResearchLibraryReferenceParams = z
  .object({ reference: z.string().trim().min(1).max(4096) })
  .strict()

export const ResearchLibraryTitleSearchParams = z
  .object({
    title: z.string().trim().min(8).max(500),
    year: z.number().int().min(1000).max(9999).nullable().optional(),
    authors: z.string().trim().max(2000).nullable().optional(),
    slug: z.boolean().optional()
  })
  .strict()
