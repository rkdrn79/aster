import { createHash } from 'node:crypto'
import { mkdir, readFile, realpath, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { withFileLock } from './research-file-transactions.mjs'
import { HarnessError } from './research-harness-error.mjs'
import { projectLayout } from './research-layout.mjs'

/**
 * The 5-line logic skeleton of a section (gap, why the obvious fix fails, insight, approach,
 * evidence), kept in `<record root>/writing/<section>.skeleton.md`. The Writing agent writes it;
 * the person confirms it in Aster before any drafting. Editing a confirmed skeleton (by hand or
 * by the agent) makes it a draft again, because the confirmation was for the old lines.
 */

export const WRITING_SKELETON_SECTIONS = ['intro', 'method', 'experiments', 'abstract', 'related']
export const WRITING_SKELETON_LINES = ['GAP', 'WHY-NOT', 'INSIGHT', 'APPROACH', 'EVIDENCE']
export const WRITING_SKELETON_OPTIONAL_LINES = [
  'BUDGET',
  'CONTEXT',
  'LOSES',
  'TERM',
  'VARIANT',
  'CONTRIBUTIONS',
  'ORDER',
  'OMIT',
  'QUESTIONS'
]
const KEYS = [...WRITING_SKELETON_LINES, ...WRITING_SKELETON_OPTIONAL_LINES]
const MAX_LINE = 2000
const MAX_NOTES = 20000
const AUTHORS = ['agent', 'user']
const KEY_LINE = new RegExp(`^\\s*(?:[-*]\\s+)?\\**(${KEYS.join('|')})\\**\\s*:\\**\\s*(.*)$`)

function checkedSection(section) {
  if (!WRITING_SKELETON_SECTIONS.includes(section)) {
    throw new HarnessError(
      'invalid_argument',
      `--section must be one of: ${WRITING_SKELETON_SECTIONS.join(', ')}`
    )
  }
  return section
}

export function skeletonRelativePath(project, section) {
  return `${projectLayout(project).root}/writing/${checkedSection(section)}.skeleton.md`
}

function frontMatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text)
  if (!match) {
    return { meta: {}, body: text }
  }
  const meta = {}
  for (const line of match[1].split(/\r?\n/)) {
    const field = /^([A-Za-z]+):\s*(.*)$/.exec(line)
    if (field) {
      meta[field[1]] = field[2].trim() || null
    }
  }
  return { meta, body: text.slice(match[0].length) }
}

/**
 * `KEY: text` lines (a key line may continue on the next non-blank lines) and the notes: every
 * other line, except code fences and headings above the first key.
 */
export function parseSkeletonText(text) {
  const { body } = frontMatter(text)
  const lines = {}
  const notes = []
  let current = null
  for (const raw of body.split(/\r?\n/)) {
    const trimmed = raw.trim()
    if (trimmed.startsWith('```')) {
      current = null
      continue
    }
    const match = KEY_LINE.exec(raw)
    if (match) {
      current = match[1]
      lines[current] = match[2].replace(/\*\*$/, '').trim()
    } else if (!trimmed) {
      current = null
      notes.push('')
    } else if (current && !trimmed.startsWith('#')) {
      lines[current] = `${lines[current]} ${trimmed}`.trim()
    } else if (Object.keys(lines).length || !trimmed.startsWith('#')) {
      current = null
      notes.push(raw)
    }
  }
  return {
    lines,
    notes: notes
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }
}

function linesHash(lines) {
  const canonical = KEYS.map((key) => `${key}:${(lines[key] ?? '').trim()}`).join('\n')
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16)
}

function skeletonView(project, section, text) {
  const relative = skeletonRelativePath(project, section)
  if (text === null) {
    return {
      section,
      path: relative,
      status: 'missing',
      lines: WRITING_SKELETON_LINES.map((key) => ({ key, text: '', required: true })),
      missing: [...WRITING_SKELETON_LINES],
      notes: '',
      updatedAt: null,
      updatedBy: null,
      confirmedAt: null,
      confirmedBy: null
    }
  }
  const { meta } = frontMatter(text)
  const { lines, notes } = parseSkeletonText(text)
  const confirmed = meta.status === 'confirmed' && meta.confirmedHash === linesHash(lines)
  return {
    section,
    path: relative,
    status: confirmed ? 'confirmed' : 'draft',
    lines: [
      ...WRITING_SKELETON_LINES.map((key) => ({ key, text: lines[key] ?? '', required: true })),
      ...WRITING_SKELETON_OPTIONAL_LINES.filter((key) => lines[key]).map((key) => ({
        key,
        text: lines[key],
        required: false
      }))
    ],
    missing: WRITING_SKELETON_LINES.filter((key) => !lines[key]?.trim()),
    notes,
    updatedAt: meta.updatedAt ?? null,
    updatedBy: meta.updatedBy ?? null,
    confirmedAt: confirmed ? (meta.confirmedAt ?? null) : null,
    confirmedBy: confirmed ? (meta.confirmedBy ?? null) : null
  }
}

async function readSkeletonText(project, section) {
  try {
    return await readFile(path.join(project, skeletonRelativePath(project, section)), 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null
    }
    throw error
  }
}

function renderSkeleton(section, lines, notes, meta) {
  const head = Object.entries({ section, ...meta })
    .map(([key, value]) => `${key}: ${value ?? ''}`.trimEnd())
    .join('\n')
  const body = KEYS.filter((key) => lines[key]?.trim()).map((key) => `${key}: ${lines[key].trim()}`)
  return `---\n${head}\n---\n\n${body.join('\n')}\n${notes ? `\n${notes.trim()}\n` : ''}`
}

async function writeSkeleton(project, section, text) {
  const target = path.join(project, skeletonRelativePath(project, section))
  await mkdir(path.dirname(target), { recursive: true })
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`
  await writeFile(temporary, text, 'utf8')
  await rename(temporary, target)
}

export async function readWritingSkeleton(projectPath, section) {
  const project = await realpath(projectPath)
  return skeletonView(project, checkedSection(section), await readSkeletonText(project, section))
}

export async function listWritingSkeletons(projectPath) {
  const project = await realpath(projectPath)
  const skeletons = []
  for (const section of WRITING_SKELETON_SECTIONS) {
    skeletons.push(skeletonView(project, section, await readSkeletonText(project, section)))
  }
  return { skeletons }
}

function checkedLines(lines) {
  const result = {}
  for (const [key, value] of Object.entries(lines ?? {})) {
    if (!KEYS.includes(key)) {
      throw new HarnessError(
        'invalid_argument',
        `Unknown skeleton line ${key}; use ${KEYS.join(', ')}`
      )
    }
    const text = String(value ?? '')
      .replace(/\s+/g, ' ')
      .trim()
    if (text.length > MAX_LINE) {
      throw new HarnessError('invalid_argument', `${key} is longer than ${MAX_LINE} characters`)
    }
    result[key] = text
  }
  return result
}

/**
 * Writes the skeleton from `text` (KEY: lines, then notes) or from `lines` and `notes`. Lines
 * left out keep their current text. Any write leaves the skeleton a draft until it is confirmed.
 */
export async function setWritingSkeleton(
  projectPath,
  section,
  { text = null, lines = null, notes = null, by = 'agent' } = {}
) {
  const project = await realpath(projectPath)
  checkedSection(section)
  if (!AUTHORS.includes(by)) {
    throw new HarnessError('invalid_argument', `by must be one of: ${AUTHORS.join(', ')}`)
  }
  const parsed = text === null ? { lines: lines ?? {}, notes } : parseSkeletonText(text)
  if (text !== null && !Object.keys(parsed.lines).length) {
    throw new HarnessError(
      'invalid_argument',
      `No skeleton lines found; write lines such as "GAP: ..." (${WRITING_SKELETON_LINES.join(', ')})`
    )
  }
  const incoming = checkedLines(parsed.lines)
  const target = path.join(project, skeletonRelativePath(project, section))
  await mkdir(path.dirname(target), { recursive: true })
  return withFileLock(`${target}.lock`, async () => {
    const currentText = await readSkeletonText(project, section)
    const current = currentText === null ? { lines: {}, notes: '' } : parseSkeletonText(currentText)
    const merged = { ...current.lines, ...incoming }
    const nextNotes =
      parsed.notes === null || parsed.notes === undefined ? current.notes : String(parsed.notes)
    if (nextNotes.length > MAX_NOTES) {
      throw new HarnessError('invalid_argument', `Notes are longer than ${MAX_NOTES} characters`)
    }
    const meta = { status: 'draft', updatedAt: new Date().toISOString(), updatedBy: by }
    await writeSkeleton(project, section, renderSkeleton(section, merged, nextNotes, meta))
    return skeletonView(project, section, await readSkeletonText(project, section))
  })
}

/** The person's decision: refused while a required line is empty. */
export async function confirmWritingSkeleton(projectPath, section, { by = 'user' } = {}) {
  const project = await realpath(projectPath)
  checkedSection(section)
  const target = path.join(project, skeletonRelativePath(project, section))
  return withFileLock(`${target}.lock`, async () => {
    const text = await readSkeletonText(project, section)
    if (text === null) {
      throw new HarnessError(
        'not_found',
        `No ${section} skeleton yet: ${skeletonRelativePath(project, section)}`
      )
    }
    const { meta } = frontMatter(text)
    const { lines, notes } = parseSkeletonText(text)
    const missing = WRITING_SKELETON_LINES.filter((key) => !lines[key]?.trim())
    if (missing.length) {
      throw new HarnessError(
        'incomplete',
        `Fill in ${missing.join(', ')} before confirming the ${section} skeleton`
      )
    }
    await writeSkeleton(
      project,
      section,
      renderSkeleton(section, lines, notes, {
        status: 'confirmed',
        updatedAt: meta.updatedAt ?? null,
        updatedBy: meta.updatedBy ?? null,
        confirmedAt: new Date().toISOString(),
        confirmedBy: by,
        confirmedHash: linesHash(lines)
      })
    )
    return skeletonView(project, section, await readSkeletonText(project, section))
  })
}
