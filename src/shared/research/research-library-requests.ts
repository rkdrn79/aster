import { z } from 'zod'
import { parseArxivReference } from './research-library-arxiv'
import { parseDoiReference } from './research-library-doi'
import {
  findPaperMentionsInText,
  paperMentionFromUrl,
  type PaperMention
} from './research-library-mentions'
import { arxivIdBase, normalizePaperTitle } from './research-library-paper-match'

/** Where the harness's `library add` leaves requests, relative to the project (per machine). */
export const LIBRARY_REQUEST_PATHS = [
  '.aster/local/library-requests.jsonl',
  'research/.aster/library-requests.jsonl'
] as const

const optionalText = (max: number) => z.string().trim().min(1).max(max).optional().catch(undefined)

/** One line the harness writes; read tolerantly, since agents on older harnesses write it too. */
export const libraryRequestSchema = z.object({
  v: z.literal(1),
  id: z.string().regex(/^lr-[A-Za-z0-9-]{1,64}$/),
  createdAt: z.string().max(64),
  arxivId: optionalText(64),
  doi: optionalText(256),
  url: optionalText(4096),
  title: optionalText(500),
  authors: optionalText(2000),
  year: z.number().int().min(1000).max(9999).optional().catch(undefined),
  note: optionalText(500),
  source: optionalText(64),
  agent: z
    .object({
      provider: z.string().max(64).nullable().catch(null),
      sessionId: z.string().max(256).nullable().catch(null)
    })
    .nullable()
    .optional()
    .catch(undefined)
})

export type LibraryRequest = z.infer<typeof libraryRequestSchema>

/** The newest requests of a requests file, oldest first; torn or foreign lines are skipped. */
export function parseLibraryRequests(text: string, limit = 200): LibraryRequest[] {
  const requests: LibraryRequest[] = []
  for (const line of text.split('\n')) {
    if (!line.trim()) {
      continue
    }
    try {
      const parsed = libraryRequestSchema.safeParse(JSON.parse(line))
      if (parsed.success) {
        requests.push(parsed.data)
      }
    } catch {
      // A torn last line from an interrupted append.
    }
  }
  return requests.slice(-limit)
}

/** The paper a request names, as a chat mention would; null when it names none Aster can read. */
export function mentionFromLibraryRequest(request: LibraryRequest): PaperMention | null {
  const details = {
    ...(request.title ? { title: request.title } : {}),
    ...(request.authors ? { authors: request.authors } : {}),
    ...(request.year ? { year: request.year } : {})
  }
  const arxivId = request.arxivId ? parseArxivReference(request.arxivId) : null
  if (arxivId) {
    return { key: `arxiv:${arxivIdBase(arxivId)}`, kind: 'arxiv', arxivId, ...details }
  }
  const doi = request.doi ? parseDoiReference(request.doi) : null
  if (doi) {
    const [mention] = findPaperMentionsInText(doi)
    return mention ? { ...mention, ...details } : null
  }
  const fromUrl = request.url ? paperMentionFromUrl(request.url) : null
  if (fromUrl) {
    return { ...fromUrl, ...details }
  }
  const words = request.title ? normalizePaperTitle(request.title) : ''
  return words
    ? {
        key: `title:${words}`,
        kind: 'title',
        // Why: the agent named this paper on purpose, so it is added even without a lookup match.
        trusted: true,
        ...(request.url ? { url: request.url } : {}),
        ...details
      }
    : null
}
