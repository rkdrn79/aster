import { readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import { readCatalog } from './research-catalog.mjs'
import { HarnessError } from './research-harness-error.mjs'
import { projectLayout } from './research-layout.mjs'
import {
  manuscriptSourceFiles,
  projectFile,
  projectRelative
} from './research-manuscript-numbers.mjs'
import { proseParagraph } from './research-writing-prose.mjs'
import {
  readManuscriptLines,
  segmentManuscript,
  textMacros,
  WRITING_ROLES
} from './research-writing-tex.mjs'

/**
 * The manuscript `writing check` and `writing outline` read. A `--file` that the project's
 * manuscript includes is read inside the whole manuscript, so references, labels and notation
 * defined elsewhere count; a lone section file is read alone, as one section.
 */

export const WRITING_SECTION_OPTIONS = [
  'abstract',
  'intro',
  'related',
  'background',
  'method',
  'experiments',
  'conclusion'
]

const LABEL_KINDS = [
  [/^(?:fig|figure)[:_-]/i, 'figure'],
  [/^(?:tab|table|tbl)[:_-]/i, 'table'],
  [/^(?:alg|algo|algorithm)[:_-]/i, 'algorithm'],
  [/^(?:eq|eqn|equation)[:_-]/i, 'equation'],
  [/^(?:sec|section|subsec|ch|chap|app|appendix)[:_-]/i, 'section'],
  [/^(?:thm|lem|lemma|prop|cor|def|theorem)[:_-]/i, 'theorem']
]

export function labelKindFromName(label) {
  return LABEL_KINDS.find(([pattern]) => pattern.test(label))?.[1] ?? 'unknown'
}

async function readCatalogOrNull(project) {
  try {
    return await readCatalog(project)
  } catch {
    return null
  }
}

async function writingSettings(project) {
  try {
    const text = await readFile(
      path.join(project, projectLayout(project).root, 'writing.json'),
      'utf8'
    )
    const parsed = JSON.parse(text)
    return {
      notationKnown: Array.isArray(parsed?.notationKnown) ? parsed.notationKnown.map(String) : []
    }
  } catch {
    return { notationKnown: [] }
  }
}

/** The file to read as the root, and the file whose findings are reported (null: all). */
async function chooseRoot(project, catalog, file) {
  const catalogMain = catalog?.manuscript?.source
    ? await projectFile(project, catalog.manuscript.source).catch(() => null)
    : null
  if (!file) {
    if (!catalogMain) {
      throw new HarnessError('invalid_argument', 'No manuscript source in the catalog; pass --file')
    }
    return { root: catalogMain, target: null }
  }
  const chosen = await projectFile(project, path.relative(project, path.resolve(project, file)))
  if (catalogMain && chosen !== catalogMain) {
    const included = await manuscriptSourceFiles(project, catalogMain).catch(() => [])
    if (included.includes(chosen)) {
      return { root: catalogMain, target: projectRelative(project, chosen) }
    }
  }
  return { root: chosen, target: null }
}

function labelsOf(lines, floats) {
  const kinds = new Map()
  for (const float of floats) {
    for (const label of float.labels) {
      kinds.set(label, float.labelKinds[label])
    }
  }
  for (const { text } of lines) {
    for (const match of text.matchAll(/\\label\{([^}]*)\}/g)) {
      const label = match[1].trim()
      if (!kinds.has(label)) {
        kinds.set(label, labelKindFromName(label))
      }
    }
  }
  return kinds
}

function referencedLabels(lines) {
  const referenced = new Set()
  for (const { text } of lines) {
    for (const match of text.matchAll(
      /\\(?:[cC]ref|autoref|Autoref|ref|eqref|figref|tabref|subref|vref|nameref|pageref)\*?\{([^}]*)\}/g
    )) {
      for (const label of match[1].split(',')) {
        referenced.add(label.trim())
      }
    }
  }
  return referenced
}

/**
 * Reads and segments the manuscript. `section` restricts a whole paper to sections of that role
 * and labels a lone section file with it.
 */
export async function readWritingDocument(projectPath, { file = null, section = null } = {}) {
  if (section !== null && !WRITING_SECTION_OPTIONS.includes(section)) {
    throw new HarnessError(
      'invalid_argument',
      `--section must be one of: ${WRITING_SECTION_OPTIONS.join(', ')}`
    )
  }
  const project = await realpath(projectPath)
  const catalog = await readCatalogOrNull(project)
  const { root, target } = await chooseRoot(project, catalog, file)
  const { lines, files } = await readManuscriptLines(project, root)
  const macros = textMacros(lines)
  const segmented = segmentManuscript(lines, { forcedRole: section })
  const labels = labelsOf(lines, segmented.floats)
  const sections = segmented.sections.map((entry) => {
    const all = entry.paragraphs
      .map((paragraph) => proseParagraph(paragraph, macros))
      .filter(Boolean)
    const prose = all.filter((paragraph) => !paragraph.short)
    for (const paragraph of all) {
      for (const ref of paragraph.refs) {
        ref.kind = labels.get(ref.labels[0]) ?? labelKindFromName(ref.labels[0] ?? '')
      }
    }
    // Why both: shape rules and profiles skip lead-ins under 12 words, as the calibration did;
    // notation, citations and references count every paragraph.
    return Object.assign(entry, {
      prose,
      allProse: all,
      shortProse: all.filter((paragraph) => paragraph.short)
    })
  })
  const inTarget = (entry) =>
    !target || entry.file === target || entry.prose.some((paragraph) => paragraph.file === target)
  const checked = sections.filter(
    (entry) => inTarget(entry) && (segmented.fragment || section === null || entry.role === section)
  )
  if (!checked.length && section && !segmented.fragment) {
    const role = String(section)
    const found = [
      ...new Set(sections.map((entry) => `${entry.title || '(untitled)'} → ${entry.role}`))
    ]
    throw new HarnessError(
      'invalid_argument',
      `No ${role} section in ${String(projectRelative(project, root))}${target ? ` (${target})` : ''}. Sections: ${found.join('; ') || 'none'}. Mark one with % aster:section=${role} on its \\section line.`
    )
  }
  return {
    project,
    catalog,
    settings: await writingSettings(project),
    root,
    manuscript: projectRelative(project, root),
    target,
    files,
    lines,
    macros,
    fragment: segmented.fragment,
    sections,
    checked: new Set(checked),
    floats: segmented.floats,
    owners: segmented.owners,
    labels,
    referenced: referencedLabels(lines)
  }
}

export { WRITING_ROLES }
