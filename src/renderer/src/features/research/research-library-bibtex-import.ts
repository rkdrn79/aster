import { createBrowserUuid } from '@/lib/browser-uuid'
import {
  isPaperInScope,
  type LibraryPaper,
  type LibraryScope
} from '../../../../shared/research/research-library'
import {
  readBibtexEntries,
  type BibtexEntry
} from '../../../../shared/research/bibtex-entry-reader'
import { resolveRuntimePath } from '../../../../shared/cross-platform-path'
import { readResearchTextFile, researchFileExists } from './research-file-reader'
import { useResearchLibrary } from './research-library-store'

const BIBLIOGRAPHY_CANDIDATES = ['paper/main.bib', 'paper/references.bib', 'references.bib']
const MAX_BIB_BYTES = 4 * 1024 * 1024
const MAX_ENTRIES = 2_000

function httpUrl(value: string | undefined): string | undefined {
  if (!value || value.length > 4096) {
    return undefined
  }
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined
  } catch {
    return undefined
  }
}

function paperFromBibtex(
  scope: LibraryScope,
  entry: BibtexEntry,
  now: string
): LibraryPaper | null {
  const title = entry.fields.title?.trim().slice(0, 500)
  if (!title || !entry.key.trim()) {
    return null
  }
  const year = Number(entry.fields.year)
  const url = httpUrl(entry.fields.url?.trim())
  const venue = entry.fields.booktitle ?? entry.fields.journal ?? entry.fields.venue
  return {
    id: createBrowserUuid(),
    scope,
    title,
    bibtexKey: entry.key.slice(0, 256),
    ...(entry.fields.author ? { authors: entry.fields.author.slice(0, 2000) } : {}),
    ...(Number.isInteger(year) && year >= 1000 && year <= 9999 ? { year } : {}),
    ...(venue ? { venue: venue.slice(0, 200) } : {}),
    ...(entry.fields.doi?.trim() ? { doi: entry.fields.doi.trim().slice(0, 256) } : {}),
    ...(url ? { externalUrl: url } : {}),
    tags: [],
    status: 'unread',
    createdAt: now,
    updatedAt: now
  }
}

export function papersFromBibtex(
  scope: LibraryScope,
  entries: readonly BibtexEntry[],
  existing: readonly LibraryPaper[],
  now: string
): LibraryPaper[] {
  const known = new Set(
    existing
      .filter((paper) => isPaperInScope(paper, scope) && paper.bibtexKey)
      .map((paper) => paper.bibtexKey)
  )
  const incoming: LibraryPaper[] = []
  for (const entry of entries) {
    const paper = paperFromBibtex(scope, entry, now)
    if (!paper || known.has(paper.bibtexKey)) {
      continue
    }
    known.add(paper.bibtexKey)
    incoming.push(paper)
  }
  return incoming
}

export async function importProjectBibliography(
  scope: LibraryScope
): Promise<{ path: string; added: number; malformed: number; truncated: boolean }> {
  const path = await (async () => {
    for (const candidate of BIBLIOGRAPHY_CANDIDATES) {
      if (await researchFileExists(scope, resolveRuntimePath(scope.workspacePath, candidate))) {
        return candidate
      }
    }
    return null
  })()
  if (!path) {
    throw new Error('No project bibliography was found. Add a .bib file under paper/ first.')
  }
  const content = await readResearchTextFile(
    scope,
    resolveRuntimePath(scope.workspacePath, path),
    MAX_BIB_BYTES
  )
  const parsed = readBibtexEntries(content, MAX_ENTRIES)
  const now = new Date().toISOString()
  let added = 0
  await useResearchLibrary.getState().update((current) => {
    const incoming = papersFromBibtex(scope, parsed.entries, current.papers, now)
    added = incoming.length
    return { ...current, papers: [...current.papers, ...incoming] }
  })
  return { path, added, malformed: parsed.malformed, truncated: parsed.truncated }
}
