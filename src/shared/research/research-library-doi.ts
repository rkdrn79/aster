import { z } from 'zod'

export type DoiPaperMetadata = {
  doi: string
  title: string
  authors: string[]
  year: number | null
  venue: string | null
  abstract: string | null
  url: string | null
}

const DOI_PATTERN = /^10\.\d{4,9}\/\S+$/

/** A bare DOI from `10.x/…`, `doi:10.x/…`, or a doi.org link; null when it is none of those. */
export function parseDoiReference(input: string): string | null {
  const value = input
    .trim()
    .replace(/^doi:\s*/i, '')
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
  return DOI_PATTERN.test(value) && value.length <= 256 ? value : null
}

const crossrefWorkSchema = z.object({
  message: z.object({
    DOI: z.string(),
    title: z.array(z.string()).catch([]),
    author: z
      .array(
        z.object({
          given: z.string().optional(),
          family: z.string().optional(),
          name: z.string().optional()
        })
      )
      .catch([]),
    issued: z
      .object({ 'date-parts': z.array(z.array(z.number().nullable())) })
      .optional()
      .catch(undefined),
    'container-title': z.array(z.string()).catch([]),
    abstract: z.string().optional().catch(undefined),
    URL: z.string().optional().catch(undefined)
  })
})

function plainText(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Crossref's `/works/<doi>` reply as paper details; null when it has no usable title. */
export function parseCrossrefWork(json: unknown): DoiPaperMetadata | null {
  const parsed = crossrefWorkSchema.safeParse(json)
  if (!parsed.success) {
    return null
  }
  const work = parsed.data.message
  const title = plainText(work.title[0] ?? '')
  if (!title) {
    return null
  }
  const year = work.issued?.['date-parts'][0]?.[0] ?? null
  const abstract = work.abstract
    ? plainText(work.abstract.replace(/^\s*<jats:title>.*?<\/jats:title>/i, ''))
    : ''
  return {
    doi: work.DOI,
    title,
    authors: work.author
      .map((author) => author.name ?? [author.given, author.family].filter(Boolean).join(' '))
      .filter((name) => name.trim().length > 0),
    year: year && year >= 1000 && year <= 9999 ? year : null,
    venue: work['container-title'][0] ? plainText(work['container-title'][0]) : null,
    abstract: abstract || null,
    url: work.URL && /^https?:\/\//i.test(work.URL) ? work.URL : null
  }
}
