import type { LibraryPaper } from '../../../../shared/research/research-library'

type CitablePaper = Pick<
  LibraryPaper,
  'title' | 'authors' | 'year' | 'doi' | 'venue' | 'arxivId' | 'externalUrl'
>

export function paperCitationText(paper: CitablePaper): string {
  const parts = [
    paper.authors?.trim(),
    paper.year ? `(${paper.year})` : null,
    paper.title.trim(),
    paper.venue?.trim()
  ]
    .filter(Boolean)
    .join(' ')
  if (paper.doi) {
    return `${parts}. DOI: ${paper.doi.trim()}`
  }
  return paper.arxivId ? `${parts}. arXiv:${paper.arxivId}` : `${parts}.`
}

function authorList(authors: string | undefined): string[] {
  return (authors ?? '')
    .split(/\s*(?:,|;|\band\b)\s*/)
    .map((name) => name.trim())
    .filter(Boolean)
}

function bibtexEscape(value: string): string {
  return value.replace(/[{}]/g, '').replace(/([&%$#_])/g, '\\$1')
}

export function paperBibtexKey(paper: CitablePaper): string {
  const surname = authorList(paper.authors)[0]?.split(/\s+/).at(-1) ?? 'paper'
  const word =
    paper.title
      .split(/\s+/)
      .map((entry) => entry.replace(/[^\p{L}\p{N}]/gu, ''))
      .find((entry) => entry.length > 3) ?? 'untitled'
  return `${surname}${paper.year ?? ''}${word}`
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9]/g, '')
    .toLowerCase()
}

export function paperBibtex(paper: CitablePaper): string {
  const arxivId = paper.arxivId?.replace(/v\d+$/, '')
  const fields: [string, string | undefined][] = [
    // Why: the inner braces keep the title's capitalization in every BibTeX style.
    ['title', `{${bibtexEscape(paper.title)}}`],
    ['author', authorList(paper.authors).map(bibtexEscape).join(' and ') || undefined],
    ['year', paper.year?.toString()],
    ['journal', paper.venue && bibtexEscape(paper.venue)],
    ['eprint', arxivId],
    ['archivePrefix', arxivId ? 'arXiv' : undefined],
    ['doi', paper.doi],
    ['url', paper.externalUrl ?? (arxivId ? `https://arxiv.org/abs/${arxivId}` : undefined)]
  ]
  const body = fields
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([name, value]) => `  ${name} = {${value}}`)
    .join(',\n')
  const type = paper.venue && !arxivId ? 'article' : 'misc'
  return `@${type}{${paperBibtexKey(paper)},\n${body}\n}`
}
