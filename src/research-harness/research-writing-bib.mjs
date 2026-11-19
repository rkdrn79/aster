import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { projectFile, projectRelative } from './research-manuscript-numbers.mjs'

/**
 * The citation keys a manuscript may use: entries of the catalog's .bib, the `\bibliography{}` /
 * `\addbibresource{}` files, the compiled `<main>.bbl`, and an inline `thebibliography`. A key
 * found in none of them is a key the Writing agent must not cite.
 */

const MAX_BIB_BYTES = 20 * 1024 * 1024

function cleanTitle(value) {
  return value
    .replace(/\\[a-zA-Z]+\s*/g, '')
    .replace(/[{}"]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Reads one `field = {...}` or `field = "..."` value starting at `start` (after the `=`). */
function fieldValue(text, start) {
  let index = start
  while (/\s/.test(text[index] ?? '')) {
    index += 1
  }
  const open = text[index]
  if (open === '{') {
    let depth = 0
    for (let cursor = index; cursor < text.length; cursor += 1) {
      if (text[cursor] === '{') {
        depth += 1
      } else if (text[cursor] === '}') {
        depth -= 1
        if (depth === 0) {
          return text.slice(index + 1, cursor)
        }
      }
    }
    return null
  }
  if (open === '"') {
    const end = text.indexOf('"', index + 1)
    return end === -1 ? null : text.slice(index + 1, end)
  }
  const bare = /^[^,}\s]+/.exec(text.slice(index))
  return bare ? bare[0] : null
}

/** Keys, titles and years of a .bib file's entries (@string, @comment and @preamble skipped). */
export function parseBibtex(text) {
  const entries = []
  const starts = [...text.matchAll(/@([a-zA-Z]+)\s*[{(]\s*([^,\s]+)\s*,/g)]
  for (let index = 0; index < starts.length; index += 1) {
    const match = starts[index]
    if (/^(?:string|comment|preamble)$/i.test(match[1])) {
      continue
    }
    const body = text.slice(match.index + match[0].length, starts[index + 1]?.index ?? text.length)
    const field = (name) => {
      const found = new RegExp(`(?:^|[,\\s])${name}\\s*=`, 'i').exec(body)
      return found ? fieldValue(body, found.index + found[0].length) : null
    }
    entries.push({
      key: match[2],
      type: match[1].toLowerCase(),
      title: cleanTitle(field('title') ?? ''),
      year: (field('year') ?? '').replace(/[{}]/g, '').trim() || null
    })
  }
  return entries
}

/** Keys and titles from `\bibitem` entries (a .bbl or an inline thebibliography). */
export function parseBibitems(text) {
  const items = [...text.matchAll(/\\bibitem\s*(?:\[(?:[^[\]]|\[[^\]]*\])*\])?\s*\{([^}]+)\}/g)]
  return items.map((match, index) => {
    const body = text.slice(match.index + match[0].length, items[index + 1]?.index ?? text.length)
    const blocks = body.split(/\\newblock\b/)
    const year = /\b(19|20)\d{2}\b/.exec(body)
    return {
      key: match[1].trim(),
      type: 'bibitem',
      title: cleanTitle(blocks[1] ?? blocks[0] ?? '').replace(/\.$/, ''),
      year: year ? year[0] : null
    }
  })
}

function declaredBibliographies(lines, mainDirectory) {
  const names = []
  for (const { text } of lines) {
    for (const match of text.matchAll(/\\bibliography\{([^}]*)\}/g)) {
      names.push(...match[1].split(',').map((name) => name.trim()))
    }
    for (const match of text.matchAll(/\\addbibresource(?:\[[^\]]*\])?\{([^}]*)\}/g)) {
      names.push(match[1].trim())
    }
  }
  return names
    .filter(Boolean)
    .map((name) => path.resolve(mainDirectory, name.endsWith('.bib') ? name : `${name}.bib`))
}

async function existingProjectFile(project, absolute) {
  return projectFile(project, path.relative(project, absolute)).catch(() => null)
}

/**
 * Every bibliography source of the manuscript with its entries. `declared` lists .bib files the
 * catalog or the manuscript names that do not exist (the agent should not write keys for them).
 */
export async function readBibliography(project, mainFile, lines, catalog) {
  const mainDirectory = path.dirname(mainFile)
  const candidates = [
    ...(catalog?.references?.bibliography
      ? [path.resolve(project, catalog.references.bibliography)]
      : []),
    ...declaredBibliographies(lines, mainDirectory),
    path.join(mainDirectory, `${path.basename(mainFile, path.extname(mainFile))}.bbl`)
  ]
  const sources = []
  const missing = []
  const seen = new Set()
  for (const candidate of candidates) {
    if (seen.has(candidate)) {
      continue
    }
    seen.add(candidate)
    const found = await existingProjectFile(project, candidate)
    if (!found) {
      if (candidate.endsWith('.bib')) {
        missing.push(projectRelative(project, candidate))
      }
      continue
    }
    sources.push(found)
  }
  if (!sources.some((file) => file.endsWith('.bib'))) {
    // Why: a project often keeps its .bib beside the paper under another name than it declares.
    const siblings = await readdir(mainDirectory).catch(() => [])
    for (const name of siblings.filter((entry) => entry.endsWith('.bib')).slice(0, 5)) {
      const found = await existingProjectFile(project, path.join(mainDirectory, name))
      if (found && !sources.includes(found)) {
        sources.push(found)
      }
    }
  }
  const entries = []
  for (const source of sources) {
    const text = await readFile(source, 'utf8')
    if (text.length > MAX_BIB_BYTES) {
      continue
    }
    const file = projectRelative(project, source)
    const parsed = source.endsWith('.bbl') ? parseBibitems(text) : parseBibtex(text)
    entries.push(...parsed.map((entry) => ({ ...entry, file })))
  }
  const inline = lines.map((line) => line.text).join('\n')
  if (inline.includes('\\bibitem')) {
    entries.push(...parseBibitems(inline).map((entry) => ({ ...entry, file: lines[0]?.file })))
  }
  const byKey = new Map()
  for (const entry of entries) {
    if (!byKey.has(entry.key)) {
      byKey.set(entry.key, entry)
    }
  }
  return {
    files: sources.map((source) => projectRelative(project, source)),
    missing: missing.filter(
      (file) => !sources.some((source) => projectRelative(project, source) === file)
    ),
    entries: [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key))
  }
}

/** `writing bib`: every key the manuscript may cite, with its title, and the declared files that are missing. */
export async function listWritingBibliography(projectPath, { file = null } = {}) {
  const { readWritingDocument } = await import('./research-writing-document.mjs')
  const document = await readWritingDocument(projectPath, { file })
  const bibliography = await readBibliography(
    document.project,
    document.root,
    document.lines,
    document.catalog
  )
  return { manuscript: document.manuscript, ...bibliography }
}
