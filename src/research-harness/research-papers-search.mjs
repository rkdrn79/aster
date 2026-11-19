// `papers search`: the agent's literature search for prior methods, over the arXiv API (titles,
// authors, dates and abstracts; no PDFs). Results already in the project Library are marked, and the
// agent records the papers it uses as arXiv id + title (plan.baselineSearch.closest), the form the
// Library imports. A sandboxed agent reaches arXiv only through a local proxy named by
// ASTER_PAPER_SEARCH_SOCKET, which may restrict what it returns.

import http from 'node:http'
import https from 'node:https'
import { realpath } from 'node:fs/promises'
import { HarnessError } from './research-harness-error.mjs'
import { projectLibrary } from './research-plan-premortem.mjs'

export const ARXIV_API = 'https://export.arxiv.org/api/query'
export const SEARCH_SOCKET_ENV = 'ASTER_PAPER_SEARCH_SOCKET'
const MAX_TERMS = 6
const MIN_TERMS = 2
const MAX_RESULTS = 25
const SUMMARY_CHARS = 400
const TIMEOUT_MS = 30_000
/** arXiv asks API clients to wait 3 seconds between requests. */
const PAUSE_MS = 3000
const STOPWORDS = new Set(
  'a an and are as at be by for from how in into is it of on or our over the their this to using via vs we what when which with without'.split(
    ' '
  )
)

/** Quoted phrases stay whole; other words drop punctuation and stopwords. At most six terms. */
export function searchTerms(query) {
  const terms = []
  const pattern = /"([^"]+)"|(\S+)/gu
  for (const match of String(query ?? '').matchAll(pattern)) {
    const raw = (match[1] ?? match[2]).replace(/[^\p{L}\p{N}+\- ]+/gu, ' ').trim()
    const phrase = match[1] !== undefined
    if (!raw || (!phrase && (STOPWORDS.has(raw.toLowerCase()) || raw.length < 2))) {
      continue
    }
    terms.push(phrase ? `"${raw.replace(/\s+/gu, ' ')}"` : raw.split(/\s+/u)[0])
  }
  return terms.slice(0, MAX_TERMS)
}

function compactDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value ?? '')) {
    throw new HarnessError('invalid_argument', '--before must be a date like 2024-05-22')
  }
  return value.replaceAll('-', '')
}

/** arXiv's search_query: every term in any field, optionally submitted before a date. */
export function arxivSearchQuery(terms, { before = null } = {}) {
  const query = terms.map((term) => `all:${term}`).join(' AND ')
  return before ? `${query} AND submittedDate:[190001010000 TO ${compactDate(before)}0000]` : query
}

function decode(value) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gu, '$1')
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/&#(\d+);/gu, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/gu, '&')
    .replace(/\s+/gu, ' ')
    .trim()
}

function element(entry, tag) {
  const match = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'u').exec(entry)
  return match ? decode(match[1]) : null
}

/** The entries of an arXiv Atom feed. */
export function parseArxivFeed(xml) {
  const entries = []
  for (const match of String(xml).matchAll(/<entry>([\s\S]*?)<\/entry>/gu)) {
    const entry = match[1]
    const id = /arxiv\.org\/abs\/([^<\s]+?)(v\d+)?\s*</u.exec(entry)?.[1] ?? null
    const title = element(entry, 'title')
    if (!id || !title) {
      continue
    }
    const published = element(entry, 'published')
    const summary = element(entry, 'summary') ?? ''
    entries.push({
      arxiv: id,
      title,
      authors: [...entry.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>/gu)].map((author) =>
        decode(author[1])
      ),
      published: published ? published.slice(0, 10) : null,
      year: published ? Number(published.slice(0, 4)) : null,
      doi: element(entry, 'arxiv:doi'),
      summary: summary.length > SUMMARY_CHARS ? `${summary.slice(0, SUMMARY_CHARS - 1)}…` : summary
    })
  }
  return entries
}

/** GET over HTTPS, or over the local proxy's Unix socket when one is named. */
export function fetchText(url, { socketPath = process.env[SEARCH_SOCKET_ENV] } = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url)
    const options = socketPath
      ? { socketPath, path: `${target.pathname}${target.search}`, headers: { host: target.host } }
      : target
    const request = (socketPath ? http : https).get(options, (response) => {
      const chunks = []
      response.on('data', (chunk) => chunks.push(chunk))
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        if (response.statusCode >= 400) {
          reject(new Error(`HTTP ${response.statusCode}: ${text.slice(0, 200)}`))
        } else {
          resolve(text)
        }
      })
    })
    request.setTimeout(TIMEOUT_MS, () => request.destroy(new Error('timed out')))
    request.on('error', reject)
  })
}

function normalTitle(title) {
  return String(title ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/**
 * Searches arXiv by relevance. When every term together finds nothing, the last terms are dropped
 * one at a time (down to two). `fetch` is injectable for tests; nothing else reaches the network.
 */
export async function searchPapers(projectPath, query, options = {}) {
  const project = await realpath(projectPath)
  const terms = searchTerms(query)
  if (!terms.length) {
    throw new HarnessError(
      'usage',
      'papers search needs a query, e.g. "contrastive time series augmentation"'
    )
  }
  const max = Math.min(Math.max(Number(options.max) || 10, 1), MAX_RESULTS)
  const get = options.fetch ?? fetchText
  let used = terms
  let results = []
  for (;;) {
    const searched = arxivSearchQuery(used, { before: options.before ?? null })
    const url = `${ARXIV_API}?search_query=${encodeURIComponent(searched)}&sortBy=relevance&max_results=${max}`
    let xml
    try {
      xml = await get(url)
    } catch (error) {
      throw new HarnessError(
        'search_failed',
        `arXiv search failed (${error.message}). Use your web search or the project Library instead, and record what you find the same way.`
      )
    }
    results = parseArxivFeed(xml)
    if (results.length || used.length <= MIN_TERMS) {
      break
    }
    used = used.slice(0, -1)
    await new Promise((resolve) => setTimeout(resolve, options.pauseMs ?? PAUSE_MS))
  }
  const library = await projectLibrary(project)
  const titles = new Map(library.entries.map((entry) => [normalTitle(entry.title), entry.key]))
  return {
    query,
    terms: used,
    before: options.before ?? null,
    source: 'arXiv',
    results: results.map((paper) => ({
      ...paper,
      inLibrary: titles.get(normalTitle(paper.title)) ?? null
    }))
  }
}
