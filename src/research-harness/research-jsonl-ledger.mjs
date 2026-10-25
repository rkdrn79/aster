import { appendFile, lstat, open, readFile } from 'node:fs/promises'
import path from 'node:path'
import { HarnessError } from './research-harness-error.mjs'
import { experimentPaths, experimentSlug } from './research-layout.mjs'

/** The slug of an Experiment whose experiment.json exists. */
export async function existingExperiment(project, experiment) {
  const slug = experimentSlug(experiment)
  const metadata = path.join(experimentPaths(project, slug).experiment, 'experiment.json')
  if (
    !(await lstat(metadata).then(
      (details) => details.isFile(),
      () => false
    ))
  ) {
    throw new HarnessError('experiment_not_found', `Experiment ${slug} does not exist`)
  }
  return slug
}

/** The JSON object lines of an append-only ledger; a missing file has none. */
export async function readLedgerEntries(target) {
  let content
  try {
    content = await readFile(target, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return []
    }
    throw error
  }
  const entries = []
  for (const line of content.split('\n')) {
    if (!line.trim()) {
      continue
    }
    try {
      const entry = JSON.parse(line)
      if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
        entries.push(entry)
      }
    } catch {
      // A torn final line from an interrupted append is skipped, not fatal.
    }
  }
  return entries
}

async function endsWithNewline(target) {
  let handle
  try {
    handle = await open(target, 'r')
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return true
    }
    throw error
  }
  try {
    const { size } = await handle.stat()
    if (size === 0) {
      return true
    }
    const last = Buffer.alloc(1)
    await handle.read(last, 0, 1, size - 1)
    return last[0] === 0x0a
  } finally {
    await handle.close()
  }
}

/** Appends one entry; a torn last line is ended first so the new entry still parses. */
export async function appendLedgerEntry(target, entry) {
  const separator = (await endsWithNewline(target)) ? '' : '\n'
  await appendFile(target, `${separator}${JSON.stringify(entry)}\n`)
}

/** Next `<prefix>-<n>` after the highest recorded one, so a torn line never reuses an ID. */
export function nextLedgerId(entries, prefix) {
  let highest = 0
  for (const entry of entries) {
    const match = typeof entry?.id === 'string' ? /^(.+)-(\d+)$/u.exec(entry.id) : null
    if (match && match[1] === prefix) {
      highest = Math.max(highest, Number(match[2]))
    }
  }
  return `${prefix}-${highest + 1}`
}
