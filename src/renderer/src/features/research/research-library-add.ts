import { createBrowserUuid } from '@/lib/browser-uuid'
import { extractIpcErrorMessage } from '@/lib/ipc-error'
import type {
  LibraryPaper,
  LibraryPaperOrigin,
  LibraryScope
} from '../../../../shared/research/research-library'
import {
  findPaperMentionsInText,
  paperMentionFromUrl,
  type PaperMention
} from '../../../../shared/research/research-library-mentions'
import { findLibraryPaperMatch } from '../../../../shared/research/research-library-paper-match'
import {
  libraryDraftFromArxiv,
  libraryDraftFromDoi,
  type LibraryPaperDraft
} from './research-library-paper-records'
import { canDownloadLibraryPdf, downloadLibraryArxivPdf } from './research-library-pdf-download'
import { useResearchLibrary } from './research-library-store'

/** `none`: the lookup answered and found no paper Aster is sure of. A failed lookup throws. */
export type MentionResolution = { kind: 'paper'; draft: LibraryPaperDraft } | { kind: 'none' }

function draftFromMention(mention: PaperMention): LibraryPaperDraft | null {
  if (!mention.title) {
    return null
  }
  return {
    title: mention.title.slice(0, 500),
    ...(mention.authors ? { authors: mention.authors.slice(0, 2000) } : {}),
    ...(mention.year ? { year: mention.year } : {}),
    ...(mention.venue ? { venue: mention.venue.slice(0, 200) } : {}),
    ...(mention.arxivId ? { arxivId: mention.arxivId } : {}),
    ...(mention.doi ? { doi: mention.doi } : {}),
    ...(mention.url ? { externalUrl: mention.url } : {}),
    tags: []
  }
}

function venueYear(venue: string | null): number | undefined {
  const year = Number(venue?.match(/\b((?:19|20)\d{2})\b/)?.[1])
  return Number.isInteger(year) && year > 0 ? year : undefined
}

async function lookUp(mention: PaperMention): Promise<LibraryPaperDraft | null> {
  const api = window.api.researchLibrary
  if (mention.kind === 'arxiv' && mention.arxivId) {
    return libraryDraftFromArxiv(await api.lookupArxiv({ reference: mention.arxivId }))
  }
  if (mention.kind === 'doi' && mention.doi && api.lookupDoi) {
    return libraryDraftFromDoi(await api.lookupDoi({ reference: mention.doi }))
  }
  if (mention.kind === 'openreview' && mention.openReviewId && window.api.researchOpenReview) {
    const forum = await window.api.researchOpenReview.fetchForum({ forum: mention.openReviewId })
    const year = venueYear(forum.venue)
    return forum.title
      ? {
          title: forum.title.slice(0, 500),
          ...(forum.venue ? { venue: forum.venue.slice(0, 200) } : {}),
          ...(year ? { year } : {}),
          externalUrl: `https://openreview.net/forum?id=${encodeURIComponent(forum.forum)}`,
          tags: []
        }
      : null
  }
  if (mention.kind === 'title' && mention.title && api.searchTitle) {
    const found = await api.searchTitle({
      title: mention.title,
      year: mention.year ?? null,
      authors: mention.authors ?? null,
      ...(mention.slug ? { slug: true } : {})
    })
    if (found) {
      return found.source === 'arxiv'
        ? libraryDraftFromArxiv(found.paper)
        : libraryDraftFromDoi(found.paper)
    }
  }
  return null
}

/**
 * The Library record a mention becomes: its arXiv or Crossref details, an OpenReview title, or a
 * citation's confirmed match. BibTeX and an agent's request stand on their own when no lookup does.
 */
export async function resolvePaperMention(mention: PaperMention): Promise<MentionResolution> {
  let draft: LibraryPaperDraft | null
  try {
    draft = await lookUp(mention)
  } catch (cause) {
    const own = mention.trusted ? draftFromMention(mention) : null
    if (!own) {
      throw cause
    }
    draft = own
  }
  draft ??= mention.trusted ? draftFromMention(mention) : null
  return draft ? { kind: 'paper', draft } : { kind: 'none' }
}

export type LibraryAddition = { draft: LibraryPaperDraft; origin?: LibraryPaperOrigin }

/**
 * Adds papers the way "Add from arXiv" does, PDF included where arXiv has one. A paper the Library
 * already holds is skipped, so two windows racing on one mention add it once.
 */
export async function addLibraryDrafts(
  scope: LibraryScope,
  additions: readonly LibraryAddition[]
): Promise<{ papers: LibraryPaper[]; pdfFailure: string | null }> {
  const now = new Date().toISOString()
  const canDownload = canDownloadLibraryPdf(scope)
  const papers: LibraryPaper[] = []
  let pdfFailure: string | null = null
  const known = useResearchLibrary.getState().document?.papers ?? []
  for (const { draft, origin } of additions) {
    if (findLibraryPaperMatch(known, scope, draft)) {
      continue
    }
    let pdfPath: string | undefined
    if (draft.arxivId && canDownload) {
      try {
        pdfPath = (await downloadLibraryArxivPdf(scope, draft.arxivId)).relativePath
      } catch (cause) {
        pdfFailure ??= extractIpcErrorMessage(cause, 'The PDF download failed.')
      }
    }
    papers.push({
      id: createBrowserUuid(),
      scope,
      ...draft,
      ...(pdfPath ? { pdfPath } : {}),
      ...(origin ? { origin } : {}),
      status: 'unread',
      createdAt: now,
      updatedAt: now
    })
  }
  const added: LibraryPaper[] = []
  await useResearchLibrary.getState().update((current) => {
    const next = [...current.papers]
    for (const paper of papers) {
      if (!findLibraryPaperMatch(next, scope, paper)) {
        next.push(paper)
        added.push(paper)
      }
    }
    return { ...current, papers: next }
  })
  return { papers: added, pdfFailure }
}

export async function removeLibraryPapers(paperIds: readonly string[]): Promise<void> {
  const removed = new Set(paperIds)
  await useResearchLibrary.getState().update((current) => ({
    ...current,
    papers: current.papers.filter((paper) => !removed.has(paper.id)),
    highlights: current.highlights.filter((highlight) => !removed.has(highlight.paperId))
  }))
}

/**
 * Adds the paper an arXiv ID or link, DOI, OpenReview, ACL Anthology, Semantic Scholar or Papers
 * with Code link names, or returns the Library's copy. For other features that find papers, e.g.
 * a plan's closest prior method.
 */
export async function addLibraryPaperByReference(
  scope: LibraryScope,
  reference: string,
  origin?: LibraryPaperOrigin
): Promise<LibraryPaper> {
  const mention = paperMentionFromUrl(reference) ?? findPaperMentionsInText(reference)[0]
  if (!mention) {
    throw new Error('Name a paper by arXiv ID, DOI, or a paper link.')
  }
  await useResearchLibrary.getState().load()
  const papers = () => useResearchLibrary.getState().document?.papers ?? []
  const known = findLibraryPaperMatch(papers(), scope, mention)
  if (known) {
    return known
  }
  const resolution = await resolvePaperMention(mention)
  if (resolution.kind === 'none') {
    throw new Error('No paper was found for that reference.')
  }
  const { papers: added } = await addLibraryDrafts(scope, [{ draft: resolution.draft, origin }])
  const paper = added[0] ?? findLibraryPaperMatch(papers(), scope, resolution.draft)
  if (!paper) {
    throw new Error('The paper was not added.')
  }
  return paper
}
