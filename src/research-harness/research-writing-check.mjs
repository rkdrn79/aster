import { readClaimsLedger } from './research-claims.mjs'
import { resultNumberCandidates, tokenMatchesValue } from './research-manuscript-numbers.mjs'
import { readBibliography } from './research-writing-bib.mjs'
import { readWritingDocument } from './research-writing-document.mjs'
import { checkNotation } from './research-writing-notation.mjs'
import {
  checkContributionRecap,
  checkParagraph,
  checkSentences
} from './research-writing-rules.mjs'
import { checkSection } from './research-writing-rules-section.mjs'
import {
  describeSource,
  numberSource,
  numberSources,
  sourceMarked,
  todoSourceRule
} from './research-writing-sources.mjs'

/**
 * `writing check`: the mechanical writing lint. Findings have the shape of `figures check`
 * (errors, warnings and notes with a code and a message) plus the source location, the span and
 * a fix. The thresholds come from 18 published ML papers and 24 naive model drafts; the logic
 * (gap, insight, order by idea) is left to the Writing agent's self-critique.
 */

const SEVERITIES = ['error', 'warning', 'note']
const DOWNGRADED_IN_APPENDIX = /^W[LKSPH]-/
const TODO_KEY = /^todo\b/i
const WAIVER = /%\s*writing-check:\s*allow\s+([A-Z]{2}-[A-Z-]+)(?:\s+(\S.*))?$/

function sinkFor(document, findings) {
  return (section, code, severity, where, message, fix = null, span = null) => {
    if (!document.checked.has(section)) {
      return
    }
    if (document.target && where.file !== document.target) {
      return
    }
    findings.push({
      section,
      code,
      severity,
      file: where.file,
      line: where.line,
      message,
      fix,
      span,
      paragraph: where.paragraph ?? null
    })
  }
}

function sectionContext(section, report) {
  return {
    role: section.role,
    paragraphIndex: 0,
    paragraphLow: '',
    add(code, severity, where, message, fix, span) {
      report(
        section,
        code,
        severity,
        { ...where, paragraph: this.paragraphIndex },
        message,
        fix,
        span
      )
    }
  }
}

function floatRules(document, report) {
  for (const float of document.floats) {
    for (const label of float.labels) {
      if (!document.referenced.has(label) && float.section) {
        report(
          float.section,
          'WF-UNREFERENCED',
          document.fragment ? 'warning' : 'error',
          float,
          `${float.kind} ${label} is never referenced.`,
          `Refer to it where its point is made ("\\cref{${label}} shows ...").`,
          label
        )
      }
    }
  }
  for (const entry of document.lines) {
    const section = document.owners.get(`${entry.file}:${entry.line}`)
    if (!section) {
      continue
    }
    for (const match of entry.text.matchAll(
      /\b(Figures?|Figs?\.|Tables?|Tabs?\.)\s*~?\s*\\(?:ref|autoref)\{([^}]+)\}/g
    )) {
      const kind = document.labels.get(match[2].trim())
      const word = /^fig/i.test(match[1]) ? 'figure' : 'table'
      if ((kind === 'figure' || kind === 'table') && kind !== word) {
        report(
          section,
          'WF-REF-KIND',
          'error',
          entry,
          `"${match[1]}" refers to ${match[2]}, which is a ${kind}.`,
          `Write "${kind === 'figure' ? 'Figure' : 'Table'}" or use \\cref so the word follows the label.`,
          match[0]
        )
      }
    }
  }
  if (document.fragment) {
    return
  }
  for (const section of document.checked) {
    for (const paragraph of section.allProse) {
      for (const ref of paragraph.refs) {
        for (const label of ref.labels) {
          if (!document.labels.has(label)) {
            report(
              section,
              'WF-REF-UNDEFINED',
              'error',
              ref,
              `\\${ref.command}{${label}} points to a label that does not exist.`,
              'Fix the label, or add the figure, table or equation it should point to.',
              label
            )
          }
        }
      }
    }
  }
}

function citationKeyRules(document, bibliography, report) {
  const keys = new Set(bibliography.entries.map((entry) => entry.key))
  let warnedMissingBib = false
  for (const section of document.checked) {
    for (const paragraph of section.allProse) {
      for (const cite of paragraph.cites) {
        for (const key of cite.keys) {
          if (TODO_KEY.test(key)) {
            report(
              section,
              'WC-CITE-TODO',
              'warning',
              cite,
              `Citation placeholder \\cite{${key}}.`,
              'Find the source and add it to the .bib before export.',
              key
            )
          } else if (!keys.size && !warnedMissingBib) {
            warnedMissingBib = true
            report(
              section,
              'WC-BIB-MISSING',
              'note',
              cite,
              'No .bib or .bbl was found, so citation keys were not checked.',
              'Point the catalog at the bibliography, or keep the .bib beside the manuscript.'
            )
          } else if (keys.size && !keys.has(key)) {
            report(
              section,
              'WC-CITE-KEY',
              'error',
              cite,
              `\\cite{${key}} is not in the bibliography (${bibliography.files.join(', ')}).`,
              'Use a key `writing bib` lists, or \\cite{TODO:what-it-must-show}; never invent a key.',
              key
            )
          }
        }
      }
    }
  }
}

function linesByFile(lines) {
  const files = new Map()
  for (const entry of lines) {
    const list = files.get(entry.file) ?? []
    list[entry.line - 1] = entry.text
    files.set(entry.file, list)
  }
  return files
}

/**
 * WC-NUMBER. A number no claim backs is an error in a project with claims, unless the manuscript
 * (a table, a caption, another section) or a project data file states it: then it stays, as a
 * note until a `% source:` comment names where it comes from (the Writing guide's source order).
 */
async function numberRules(document, units, report) {
  const ledger = await readClaimsLedger(document.project).catch(() => null)
  const backing = (ledger?.claims ?? []).flatMap((claim) => claim.evidence ?? [])
  const tables = new Map()
  for (const [file, fileLines] of linesByFile(document.lines)) {
    const filled = Array.from(fileLines, (line) => line ?? '')
    for (const candidate of resultNumberCandidates(filled)) {
      const section = document.owners.get(`${file}:${candidate.line}`)
      // Why: arXiv identifiers (2305.18290) look like decimals but are references.
      if (/^\d{4}\.\d{4,5}$/.test(candidate.token.digits)) {
        continue
      }
      if (
        !section ||
        backing.some((item) =>
          tokenMatchesValue(candidate.token, item.value, { tolerance: item.tolerance ?? null })
        )
      ) {
        continue
      }
      const float = document.floats.find(
        (entry) =>
          entry.file === file && candidate.line >= entry.line && candidate.line <= entry.endLine
      )
      if (float) {
        const count = tables.get(float) ?? { section, count: 0 }
        tables.set(float, { section, count: count.count + 1 })
        continue
      }
      const source = numberSource(candidate.token, units, file, candidate.line)
      if (source) {
        if (!sourceMarked(document, file, candidate.line)) {
          report(
            section,
            'WC-NUMBER',
            'note',
            { file, line: candidate.line },
            `${candidate.text} has no claim; it matches ${describeSource(source)}.`,
            'Keep it as printed there and name the source in a comment (% source: <label or file>); suggest a claim in your hand-off.',
            candidate.text
          )
        }
        continue
      }
      const strict = ledger && ['abstract', 'intro', 'experiments'].includes(section.role)
      report(
        section,
        'WC-NUMBER',
        strict ? 'error' : 'warning',
        { file, line: candidate.line },
        `${candidate.text} reads as a result, but no claim, manuscript table or data file states it.`,
        ledger
          ? 'Record it with `claim add --run <experiment>/<run> --metric <name>`, or waive a configuration value with % writing-check: allow WC-NUMBER <reason>.'
          : 'Record it with `claim add` once a Run backs it; numbers you were given elsewhere stay, but say where they come from.',
        candidate.text
      )
    }
  }
  for (const [float, { section, count }] of tables) {
    report(
      section,
      'WC-NUMBER',
      ledger ? 'warning' : 'note',
      float,
      `${count} numbers in ${float.kind} ${float.labels[0] ?? ''} have no claim.`,
      'Record a claim for the numbers the text relies on once a Run backs them; the table is their source until then.'
    )
  }
}

function waivers(document) {
  const list = []
  const byFile = linesByFile(document.lines.map((entry) => ({ ...entry, text: entry.raw })))
  for (const entry of document.lines) {
    const match = WAIVER.exec(entry.raw)
    if (!match) {
      continue
    }
    const fileLines = byFile.get(entry.file) ?? []
    let end = entry.line
    while (end < fileLines.length && fileLines[end]?.trim()) {
      end += 1
    }
    list.push({
      code: match[1],
      reason: match[2] ?? null,
      file: entry.file,
      line: entry.line,
      end: Math.max(end, entry.line + 1),
      entry
    })
  }
  return list
}

function columnOf(document, finding) {
  if (!finding.span) {
    return null
  }
  const line = document.lines.find(
    (entry) => entry.file === finding.file && entry.line === finding.line
  )
  const index = line ? line.raw.toLowerCase().indexOf(finding.span.toLowerCase()) : -1
  return index === -1 ? null : index + 1
}

function finalize(document, raw) {
  const waived = waivers(document)
  const findings = raw.filter(
    (finding) =>
      !waived.some(
        (waiver) =>
          waiver.reason &&
          waiver.code === finding.code &&
          waiver.file === finding.file &&
          finding.line >= waiver.line &&
          finding.line <= waiver.end
      )
  )
  for (const waiver of waived.filter((entry) => !entry.reason)) {
    const section = document.owners.get(`${waiver.file}:${waiver.line}`)
    if (section && document.checked.has(section)) {
      findings.push({
        section,
        code: 'WX-WAIVER',
        severity: 'warning',
        file: waiver.file,
        line: waiver.line,
        message: `The waiver for ${waiver.code} gives no reason.`,
        fix: 'Say why the rule does not apply: % writing-check: allow CODE <reason>.',
        span: waiver.code,
        paragraph: null
      })
    }
  }
  const seen = new Set()
  return findings.filter((finding) => {
    const key = `${finding.code}|${finding.file}|${finding.line}|${finding.span ?? finding.message}`
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

function adjustSeverities(sectionFindings, role) {
  const tierA = sectionFindings.filter((finding) => finding.code === 'WL-TIERA')
  for (const finding of sectionFindings) {
    if (finding.code === 'WL-TIERA' && tierA.length >= 3) {
      finding.severity = 'error'
    }
    if (
      role === 'appendix' &&
      finding.severity === 'warning' &&
      DOWNGRADED_IN_APPENDIX.test(finding.code)
    ) {
      finding.severity = 'note'
    }
  }
}

function publicFinding(document, finding) {
  return {
    code: finding.code,
    id: null,
    message: finding.message,
    fix: finding.fix ?? null,
    file: finding.file,
    line: finding.line,
    column: columnOf(document, finding),
    span: finding.span ?? null,
    paragraph: finding.paragraph
  }
}

/** Score per section: 100 − 15 per error − 4 per warning − 1 per note, floored at 0. */
export function writingScore({ errors, warnings, notes }) {
  return Math.max(0, 100 - 15 * errors - 4 * warnings - notes)
}

export async function checkWriting(projectPath, { file = null, section = null } = {}) {
  const document = await readWritingDocument(projectPath, { file, section })
  const raw = []
  const report = sinkFor(document, raw)
  const profiles = new Map()
  for (const entry of document.checked) {
    const ctx = sectionContext(entry, report)
    entry.prose.forEach((paragraph, index) => {
      ctx.paragraphIndex = index
      checkParagraph(ctx, paragraph)
    })
    ctx.paragraphIndex = null
    for (const paragraph of entry.shortProse) {
      checkSentences(ctx, paragraph)
    }
    checkContributionRecap(ctx, entry)
    profiles.set(entry, checkSection(ctx, entry, document))
  }
  checkNotation(document.sections, document.checked, document.settings.notationKnown, report)
  floatRules(document, report)
  const bibliography = await readBibliography(
    document.project,
    document.root,
    document.lines,
    document.catalog
  )
  citationKeyRules(document, bibliography, report)
  const units = await numberSources(document)
  await numberRules(document, units, report)
  todoSourceRule(document, units, report)
  const findings = finalize(document, raw)
  const sections = [...document.checked].map((entry) => {
    const own = findings
      .filter((finding) => finding.section === entry)
      .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
    adjustSeverities(own, entry.role)
    const grouped = Object.fromEntries(
      SEVERITIES.map((severity) => [
        severity,
        own
          .filter((finding) => finding.severity === severity)
          .map((finding) => publicFinding(document, finding))
      ])
    )
    const counts = {
      errors: grouped.error.length,
      warnings: grouped.warning.length,
      notes: grouped.note.length
    }
    return {
      role: entry.role,
      title: entry.title,
      file: entry.file,
      line: entry.line,
      endLine: entry.endLine,
      profile: profiles.get(entry),
      score: writingScore(counts),
      errors: grouped.error,
      warnings: grouped.warning,
      notes: grouped.note
    }
  })
  const ledger = await readClaimsLedger(document.project).catch(() => null)
  return {
    manuscript: document.manuscript,
    files: document.files,
    fragment: document.fragment,
    bibliography: { files: bibliography.files, keys: bibliography.entries.length },
    claims: { ledger: Boolean(ledger), claims: ledger?.claims.length ?? 0 },
    summary: {
      errors: sections.reduce((sum, entry) => sum + entry.errors.length, 0),
      warnings: sections.reduce((sum, entry) => sum + entry.warnings.length, 0),
      notes: sections.reduce((sum, entry) => sum + entry.notes.length, 0)
    },
    sections
  }
}
