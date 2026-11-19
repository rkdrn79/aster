import type { NativeChatMessage } from '../native-chat-types'
import { readBibtexEntries, type BibtexEntry } from './bibtex-entry-reader'
import { openReviewForumId } from './openreview-reviews'
import { parseArxivReference } from './research-library-arxiv'
import { parseDoiReference } from './research-library-doi'
import { arxivIdBase, normalizePaperTitle } from './research-library-paper-match'

/**
 * A paper a chat message names. Identifiers (arXiv, DOI, OpenReview, ACL Anthology) are trusted as
 * they are; a `title` mention (a citation, a BibTeX entry without IDs, a Semantic Scholar or
 * Papers with Code link) only counts once a lookup confirms it.
 */
export type PaperMention = {
  /** One paper, one key: `arxiv:<id>`, `doi:<doi>`, `openreview:<id>` or `title:<words>`. */
  key: string
  kind: 'arxiv' | 'doi' | 'openreview' | 'title'
  arxivId?: string
  doi?: string
  openReviewId?: string
  url?: string
  title?: string
  authors?: string
  year?: number
  venue?: string
  /** A title read from a link's slug, which may end in author names. */
  slug?: boolean
  /** BibTeX or an agent's request gave the whole citation: it is added even when no lookup confirms it. */
  trusted?: boolean
}

const MAX_MENTIONS_PER_MESSAGE = 10
const MAX_CITATIONS_PER_MESSAGE = 3
/** A tool result naming more papers than this is a listing (search results), not a mention. */
const MAX_TOOL_RESULT_MENTIONS = 3
const MAX_SCANNED_CHARS = 200_000
/** The harness's `library add` call and its reply: that request reaches Aster with its reason. */
const LIBRARY_ADD = /\blibrary\s+add\b|Asked Aster to add/

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"'`()[\]{}|\\^]+/gi
const ARXIV_CITATION = /\barxiv\s*(?:preprint\s+)?(?:arxiv\s*)?[:\s]\s*([^\s,;)\]}]+)/gi
const BARE_DOI = /\b10\.\d{4,9}\/[^\s"<>?#&]+/g
const ACL_ID = /^(\d{4}\.[a-z0-9-]+\.\d+|[A-Z]\d{2}-\d{4})$/
const BIBTEX_ENTRY = /@[a-zA-Z]+\s*[{(]\s*[^\s,{}()]+\s*,/
const YEAR = /\b((?:19|20)\d{2})[a-z]?\b/
const AUTHOR_MARK =
  /\b([A-Z][\p{L}'’-]+(?:\s+et\s+al\.?|\s+(?:and|&)\s+[A-Z][\p{L}'’-]+)|[A-Z][\p{L}'’-]+,\s+[A-Z]\.)/u
const QUOTED_TITLE = /(?:"|“|\*\*|\*|_)([^"“”*_\n]{10,250}?)(?:"|”|\*\*|\*|_)/g
const REFERENCE_LINE =
  /^\s*(?:[-*•]\s+|\d+[.)]\s+|\[\d+\]\s*)?(\p{Lu}[^()\n]{1,200}?)\s*\(((?:19|20)\d{2})[a-z]?\)[.,]?\s+["“*_]*([^\n"“”*_]{10,250}?)["”*_]*[.?!](?:\s|$)/u

function trimTrailing(value: string): string {
  return value.replace(/[.,;:!?*_~'"”’)\]}>]+$/, '')
}

function arxivMention(arxivId: string, url?: string): PaperMention {
  return { key: `arxiv:${arxivIdBase(arxivId)}`, kind: 'arxiv', arxivId, ...(url ? { url } : {}) }
}

function doiMention(doi: string, url?: string): PaperMention {
  // Why: arXiv's own DOIs name an arXiv paper, which the arXiv lookup describes best.
  const arxiv = doi.match(/^10\.48550\/arxiv\.(.+)$/i)
  const arxivId = arxiv ? parseArxivReference(arxiv[1]) : null
  if (arxivId) {
    return arxivMention(arxivId, url)
  }
  return { key: `doi:${doi.toLowerCase()}`, kind: 'doi', doi, ...(url ? { url } : {}) }
}

function titleMention(
  title: string,
  details: Omit<PaperMention, 'key' | 'kind' | 'title'> = {}
): PaperMention | null {
  const normalized = normalizePaperTitle(title)
  if (normalized.split(' ').length < 3) {
    return null
  }
  return { key: `title:${normalized}`, kind: 'title', title: title.trim(), ...details }
}

function slugTitle(slug: string): string {
  return decodeURIComponent(slug).replace(/-\d+$/, '').replace(/[-_]+/g, ' ').trim()
}

/** The paper a link points at, from the link alone; null for any other page. */
export function paperMentionFromUrl(raw: string): PaperMention | null {
  let url: URL
  try {
    url = new URL(trimTrailing(raw))
  } catch {
    return null
  }
  if (!/^https?:$/.test(url.protocol)) {
    return null
  }
  const href = url.href
  const host = url.hostname.toLowerCase().replace(/^www\./, '')
  const arxivId = parseArxivReference(href)
  if (arxivId) {
    return arxivMention(arxivId, href)
  }
  if (host === 'openreview.net') {
    const id = /^\/(?:forum|pdf)\/?$/.test(url.pathname) ? openReviewForumId(href) : null
    return id ? { key: `openreview:${id}`, kind: 'openreview', openReviewId: id, url: href } : null
  }
  let path: string
  try {
    path = decodeURIComponent(url.pathname)
  } catch {
    return null
  }
  const doi = path.match(/\/(10\.\d{4,9}\/[^?#\s]+?)(?:\/|\.pdf)?$/)
  const parsedDoi = doi ? parseDoiReference(doi[1]) : null
  if (parsedDoi) {
    return doiMention(parsedDoi, href)
  }
  if (host === 'aclanthology.org' || host === 'aclweb.org') {
    const id = path
      .replace(/^\/anthology\//, '/')
      .replace(/\.pdf$/i, '')
      .replace(/^\/|\/$/g, '')
    // Why: ACL Anthology papers carry DOIs under 10.18653/v1/<anthology id>.
    return ACL_ID.test(id) ? doiMention(`10.18653/v1/${id}`, href) : null
  }
  const slug = host.endsWith('semanticscholar.org')
    ? path.match(/^\/paper\/([^/]+)\/[0-9a-f]{40}\/?$/i)?.[1]
    : host === 'paperswithcode.com'
      ? path.match(/^\/paper\/([^/]+)\/?$/i)?.[1]
      : undefined
  return slug ? titleMention(slugTitle(slug), { url: href, slug: true }) : null
}

/** The arXiv ID a BibTeX entry names in `eprint`, its URL, or an `arXiv:` citation. */
export function bibtexEntryArxivId(entry: BibtexEntry): string | null {
  for (const value of [entry.fields.eprint, entry.fields.url]) {
    const id = value ? parseArxivReference(value) : null
    if (id) {
      return id
    }
  }
  const citation = [entry.fields.journal, entry.fields.note, entry.fields.howpublished]
    .filter(Boolean)
    .join(' ')
  const inline = citation.match(/\barxiv\s*:\s*([^\s,;}]+)/i)
  return inline ? parseArxivReference(inline[1]) : null
}

function bibtexMention(entry: BibtexEntry): PaperMention | null {
  const title = entry.fields.title?.trim()
  if (!title) {
    return null
  }
  const year = Number(entry.fields.year?.match(YEAR)?.[1])
  const venue = entry.fields.booktitle ?? entry.fields.journal ?? entry.fields.venue
  const details = {
    ...(entry.fields.author ? { authors: entry.fields.author } : {}),
    ...(Number.isInteger(year) && year > 0 ? { year } : {}),
    ...(venue ? { venue } : {}),
    ...(entry.fields.url && /^https?:\/\//i.test(entry.fields.url)
      ? { url: entry.fields.url }
      : {}),
    trusted: true
  }
  const arxivId = bibtexEntryArxivId(entry)
  if (arxivId) {
    return { ...arxivMention(arxivId), title, ...details }
  }
  const doi = entry.fields.doi ? parseDoiReference(entry.fields.doi) : null
  if (doi) {
    return { ...doiMention(doi), title, ...details }
  }
  return titleMention(title, details)
}

/** Clear citations an agent wrote: a quoted or emphasised title with authors or a year beside it,
 *  or a reference-list line `Authors (Year). Title.` */
function citationMentions(text: string): PaperMention[] {
  const prose = text.replace(/```[\s\S]*?```/g, '\n')
  const found: PaperMention[] = []
  for (const line of prose.split('\n')) {
    const reference = line.match(REFERENCE_LINE)
    if (reference) {
      const mention = titleMention(reference[3], {
        authors: reference[1].replace(/[.,\s]+$/, ''),
        year: Number(reference[2])
      })
      if (mention) {
        found.push(mention)
        continue
      }
    }
    for (const quoted of line.matchAll(QUOTED_TITLE)) {
      const after = line.slice((quoted.index ?? 0) + quoted[0].length).slice(0, 160)
      const before = line.slice(Math.max(0, (quoted.index ?? 0) - 120), quoted.index)
      const year = after.match(YEAR)?.[1] ?? before.match(YEAR)?.[1]
      const authors = after.match(AUTHOR_MARK)?.[1] ?? before.match(AUTHOR_MARK)?.[1]
      if (!year && !authors) {
        continue
      }
      const mention = titleMention(quoted[1], {
        ...(authors ? { authors } : {}),
        ...(year ? { year: Number(year) } : {})
      })
      if (mention) {
        found.push(mention)
      }
    }
  }
  return found.slice(0, MAX_CITATIONS_PER_MESSAGE)
}

/** Every paper a piece of text names. `citations` also reads free-text citations. */
export function findPaperMentionsInText(
  input: string,
  options: { citations?: boolean } = {}
): PaperMention[] {
  const text = input.slice(0, MAX_SCANNED_CHARS)
  const found = new Map<string, PaperMention>()
  const add = (mention: PaperMention | null): void => {
    if (mention && !found.has(mention.key)) {
      found.set(mention.key, mention)
    }
  }
  if (BIBTEX_ENTRY.test(text)) {
    for (const entry of readBibtexEntries(text, MAX_MENTIONS_PER_MESSAGE).entries) {
      add(bibtexMention(entry))
    }
  }
  for (const match of text.matchAll(URL_PATTERN)) {
    add(paperMentionFromUrl(match[0]))
  }
  for (const match of text.matchAll(ARXIV_CITATION)) {
    const arxivId = parseArxivReference(trimTrailing(match[1]))
    add(arxivId ? arxivMention(arxivId) : null)
  }
  for (const match of text.matchAll(BARE_DOI)) {
    const doi = parseDoiReference(trimTrailing(match[0]))
    add(doi ? doiMention(doi) : null)
  }
  if (options.citations) {
    for (const mention of citationMentions(text)) {
      add(mention)
    }
  }
  return [...found.values()].slice(0, MAX_MENTIONS_PER_MESSAGE)
}

function toolInputText(input: unknown): string {
  if (typeof input === 'string') {
    return input
  }
  try {
    return JSON.stringify(input) ?? ''
  } catch {
    return ''
  }
}

/**
 * The papers one chat message names: the person's and the agent's words, the links an agent's
 * tool call opens, and a tool result that names one to three papers. Only an agent's own prose
 * counts free-text citations; reasoning and status rows are skipped.
 */
export function findPaperMentionsInMessage(
  message: Pick<NativeChatMessage, 'role' | 'blocks'>
): PaperMention[] {
  if (message.role === 'reasoning' || message.role === 'system') {
    return []
  }
  const found = new Map<string, PaperMention>()
  const addAll = (mentions: readonly PaperMention[]): void => {
    for (const mention of mentions) {
      if (!found.has(mention.key)) {
        found.set(mention.key, mention)
      }
    }
  }
  for (const block of message.blocks) {
    if (block.type === 'text') {
      addAll(findPaperMentionsInText(block.text, { citations: message.role === 'assistant' }))
    } else if (block.type === 'tool-call') {
      const input = toolInputText(block.input)
      if (!LIBRARY_ADD.test(input)) {
        addAll(findPaperMentionsInText(input))
      }
    } else if (block.type === 'tool-result' && !LIBRARY_ADD.test(block.output.slice(0, 4000))) {
      const mentions = findPaperMentionsInText(block.output)
      if (mentions.length <= MAX_TOOL_RESULT_MENTIONS) {
        addAll(mentions)
      }
    }
  }
  return [...found.values()].slice(0, MAX_MENTIONS_PER_MESSAGE)
}
