import { ARXIV_ID_PATTERN, type ArxivPaperMetadata } from './research-library'

const NEW_STYLE_ID = /(\d{4}\.\d{4,5})(v\d+)?/
const OLD_STYLE_ID = /([a-z-]+(?:\.[A-Z]{2})?\/\d{7})(v\d+)?/
// Why: alphaXiv, Hugging Face Papers, and arXiv mirrors all carry the arXiv ID in their paths.
const ARXIV_HOSTS =
  /(?:^|\.)(?:arxiv\.org|alphaxiv\.org|huggingface\.co|semanticscholar\.org|ar5iv\.labs\.arxiv\.org|ar5iv\.org)$/i

/** Accepts an arXiv ID, `arXiv:` citation, or an arXiv/alphaXiv/HF Papers URL. */
export function parseArxivReference(input: string): string | null {
  const value = input.trim().replace(/^arxiv:\s*/i, '')
  if (!value) {
    return null
  }
  if (ARXIV_ID_PATTERN.test(value)) {
    return value
  }
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (!/^https?:$/.test(url.protocol) || !ARXIV_HOSTS.test(url.hostname)) {
    return null
  }
  const path = decodeURIComponent(url.pathname).replace(/\.pdf$/i, '')
  const match = path.match(OLD_STYLE_ID) ?? path.match(NEW_STYLE_ID)
  if (!match) {
    return null
  }
  const id = `${match[1]}${match[2] ?? ''}`
  return ARXIV_ID_PATTERN.test(id) ? id : null
}

export function arxivPdfFileName(arxivId: string): string {
  return `${arxivId.replace(/\//g, '_')}.pdf`
}

function decodeXmlText(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(Number(decimal)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function collapse(value: string): string {
  return decodeXmlText(value).replace(/\s+/g, ' ').trim()
}

function element(entry: string, tag: string): string | null {
  const match = entry.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`))
  return match ? collapse(match[1]) : null
}

function attribute(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\s${name}="([^"]*)"`))
  return match ? decodeXmlText(match[1]) : null
}

/** Reads the first entry of an arXiv API Atom feed; null when the feed has no real paper. */
export function parseArxivAtomFeed(xml: string): ArxivPaperMetadata | null {
  const entry = xml.match(/<entry>([\s\S]*?)<\/entry>/)?.[1]
  if (!entry) {
    return null
  }
  const idUrl = element(entry, 'id')
  const title = element(entry, 'title')
  if (!idUrl || !title || /\/api\/errors/.test(idUrl)) {
    return null
  }
  const arxivId = parseArxivReference(idUrl)
  if (!arxivId) {
    return null
  }
  const authors = [...entry.matchAll(/<author>([\s\S]*?)<\/author>/g)]
    .map((author) => element(author[1], 'name'))
    .filter((name): name is string => Boolean(name))
  const published = element(entry, 'published') ?? ''
  const year = Number(published.slice(0, 4))
  const primaryTag = entry.match(/<arxiv:primary_category\b[^>]*>/)?.[0]
  const pdfLink = [...entry.matchAll(/<link\b[^>]*>/g)]
    .map((link) => link[0])
    .find((link) => attribute(link, 'title') === 'pdf')
  const pdfHref = pdfLink ? attribute(pdfLink, 'href') : null
  return {
    arxivId,
    title,
    authors,
    abstract: element(entry, 'summary') ?? '',
    published,
    year: Number.isInteger(year) && year >= 1991 ? year : null,
    primaryCategory: primaryTag ? attribute(primaryTag, 'term') : null,
    doi: element(entry, 'arxiv:doi'),
    journalRef: element(entry, 'arxiv:journal_ref'),
    absUrl: `https://arxiv.org/abs/${arxivId}`,
    pdfUrl: pdfHref?.replace(/^http:/, 'https:') ?? `https://arxiv.org/pdf/${arxivId}`
  }
}
