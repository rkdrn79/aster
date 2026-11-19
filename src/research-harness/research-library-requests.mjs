import { randomBytes } from 'node:crypto'
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { agentIdentityFromEnvironment } from './research-agent-identity.mjs'
import { withFileLock } from './research-file-transactions.mjs'
import { HarnessError } from './research-harness-error.mjs'
import { appendLedgerEntry, readLedgerEntries } from './research-jsonl-ledger.mjs'
import { localStatePaths } from './research-layout.mjs'

const ARXIV_ID = /^(?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?$/
const ARXIV_IN_URL =
  /(?:arxiv\.org|alphaxiv\.org|huggingface\.co)\/(?:abs|pdf|html|papers|overview)\/([^?#\s]+?)(?:\.pdf)?\/?(?:[?#].*)?$/i
const DOI = /^10\.\d{4,9}\/\S+$/
/** The app reads the newest requests; older ones are dropped when the file is rewritten. */
const KEEP_REQUESTS = 200

/**
 * Per-machine, git-ignored: the requests carry Aster session IDs. Aster reads this file, adds each
 * paper to the project Library or asks the person in the agent's chat, and never writes it.
 */
export function libraryRequestsPath(project) {
  return path.join(localStatePaths(project).root, 'library-requests.jsonl')
}

function arxivIdOption(value) {
  const bare = value.trim().replace(/^arxiv:\s*/i, '')
  const id = ARXIV_ID.test(bare) ? bare : (bare.match(ARXIV_IN_URL)?.[1] ?? null)
  if (!id || !ARXIV_ID.test(id)) {
    throw new HarnessError(
      'invalid_argument',
      `--arxiv takes an arXiv ID such as 2410.12345 or an arXiv link: ${value}`
    )
  }
  return id
}

function doiOption(value) {
  const doi = value
    .trim()
    .replace(/^doi:\s*/i, '')
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
  if (!DOI.test(doi) || doi.length > 256) {
    throw new HarnessError(
      'invalid_argument',
      `--doi takes a DOI such as 10.1145/3292500: ${value}`
    )
  }
  return doi
}

function urlOption(value) {
  let url
  try {
    url = new URL(value.trim())
  } catch {
    url = null
  }
  if (!url || !/^https?:$/.test(url.protocol) || url.href.length > 4096) {
    throw new HarnessError('invalid_argument', `--url takes an http(s) link to the paper: ${value}`)
  }
  return url.href
}

function textOption(value, name, max) {
  const text = value?.trim()
  if (!text) {
    return undefined
  }
  if (text.length > max) {
    throw new HarnessError('invalid_argument', `${name} is longer than ${max} characters`)
  }
  return text
}

/**
 * Asks Aster to put one paper in the project Library. The person's setting decides: Aster asks in
 * the agent's chat (the default), adds it with its PDF at once, or, when they turned chat papers
 * off, still asks. Reusable by other harness commands, e.g. a plan's closest prior method.
 */
export async function requestLibraryPaper(
  project,
  input,
  { env = process.env, now = new Date() } = {}
) {
  const fields = {
    ...(input.arxiv ? { arxivId: arxivIdOption(input.arxiv) } : {}),
    ...(input.doi ? { doi: doiOption(input.doi) } : {}),
    ...(input.url ? { url: urlOption(input.url) } : {})
  }
  const title = textOption(input.title, '--title', 500)
  const authors = textOption(input.authors, '--authors', 2000)
  const note = textOption(input.why, '--why', 500)
  const year = input.year === undefined || input.year === null ? undefined : Number(input.year)
  if (year !== undefined && !(Number.isInteger(year) && year >= 1000 && year <= 9999)) {
    throw new HarnessError('invalid_argument', `--year takes a four-digit year: ${input.year}`)
  }
  if (!fields.arxivId && !fields.doi && !fields.url && !title) {
    throw new HarnessError('usage', 'Name the paper with --arxiv, --doi, --url or --title')
  }
  const agent = agentIdentityFromEnvironment(env)
  const request = {
    v: 1,
    id: `lr-${randomBytes(6).toString('hex')}`,
    createdAt: now.toISOString(),
    ...fields,
    ...(title ? { title } : {}),
    ...(authors ? { authors } : {}),
    ...(year ? { year } : {}),
    ...(note ? { note } : {}),
    ...(input.source ? { source: String(input.source).slice(0, 64) } : {}),
    ...(agent ? { agent } : {})
  }
  const target = libraryRequestsPath(project)
  await mkdir(path.dirname(target), { recursive: true })
  await withFileLock(`${target}.lock`, async () => {
    const entries = await readLedgerEntries(target)
    if (entries.length >= KEEP_REQUESTS) {
      const kept = entries.slice(-(KEEP_REQUESTS - 1)).map((entry) => JSON.stringify(entry))
      const temporary = `${target}.${randomBytes(6).toString('hex')}.tmp`
      try {
        await writeFile(temporary, `${kept.join('\n')}\n`, { flag: 'wx' })
        await rename(temporary, target)
      } finally {
        await unlink(temporary).catch(() => {})
      }
    }
    await appendLedgerEntry(target, request)
  })
  return { request, path: path.relative(project, target).split(path.sep).join('/') }
}
