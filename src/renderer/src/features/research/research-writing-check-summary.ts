import type {
  WritingCheckResult,
  WritingCheckSection,
  WritingFinding,
  WritingSectionRole
} from '../../../../shared/research/research-writing-results'
import type { WritingFixFinding } from './research-writing-agent-prompts'

export type WritingFindingSeverity = 'error' | 'warning' | 'note'

export type WritingFindingRow = {
  /** Stable across re-checks of unchanged text, for list keys. */
  key: string
  severity: WritingFindingSeverity
  finding: WritingFinding
}

export type WritingCheckGroup = {
  key: string
  title: string
  role: WritingSectionRole
  file: string
  line: number
  /** Errors and warnings, errors first, each by line. */
  findings: WritingFindingRow[]
  notes: WritingFindingRow[]
  counts: { errors: number; warnings: number; notes: number }
  score: number | null
}

export const WRITING_ROLE_LABELS: Record<WritingSectionRole, string> = {
  abstract: 'Abstract',
  intro: 'Introduction',
  related: 'Related work',
  background: 'Background',
  method: 'Method',
  experiments: 'Experiments',
  conclusion: 'Conclusion',
  appendix: 'Appendix',
  body: 'Text'
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

/** `2 errors · 5 warnings` in the Writing header, `Check` before a check has run. */
export function writingCheckChipText(result: WritingCheckResult | null): string {
  if (!result) {
    return 'Check'
  }
  const { errors, warnings } = result.summary
  if (!errors && !warnings) {
    return 'Check passed'
  }
  return [errors ? plural(errors, 'error') : null, warnings ? plural(warnings, 'warning') : null]
    .filter(Boolean)
    .join(' · ')
}

function byLine(left: WritingFindingRow, right: WritingFindingRow): number {
  return (
    left.finding.line - right.finding.line ||
    (left.finding.column ?? 0) - (right.finding.column ?? 0)
  )
}

function rows(section: WritingCheckSection, severity: WritingFindingSeverity): WritingFindingRow[] {
  const list =
    severity === 'error'
      ? section.errors
      : severity === 'warning'
        ? section.warnings
        : section.notes
  const seen = new Map<string, number>()
  return list
    .map((finding) => {
      const base = `${severity}:${finding.code}:${finding.file}:${finding.line}:${finding.column ?? ''}`
      const repeat = seen.get(base) ?? 0
      seen.set(base, repeat + 1)
      return { key: `${base}:${repeat}`, severity, finding }
    })
    .sort(byLine)
}

/** Sections in document order, those without findings or notes left out. */
export function writingCheckGroups(result: WritingCheckResult): WritingCheckGroup[] {
  return result.sections
    .map((section, index) => ({
      key: `${section.file}:${section.line}:${index}`,
      title: section.title || WRITING_ROLE_LABELS[section.role],
      role: section.role,
      file: section.file,
      line: section.line,
      findings: [...rows(section, 'error'), ...rows(section, 'warning')],
      notes: rows(section, 'note'),
      counts: {
        errors: section.errors.length,
        warnings: section.warnings.length,
        notes: section.notes.length
      },
      score: section.score
    }))
    .filter((group) => group.findings.length || group.notes.length)
}

/** What "Ask Writing agent to fix" sends: every error, then every warning. */
export function writingFixFindings(result: WritingCheckResult): {
  findings: WritingFixFinding[]
  total: number
} {
  const errors = result.sections.flatMap((section) =>
    section.errors.map((finding): WritingFixFinding => ({ ...finding, severity: 'error' }))
  )
  const warnings = result.sections.flatMap((section) =>
    section.warnings.map((finding): WritingFixFinding => ({ ...finding, severity: 'warning' }))
  )
  const findings = [...errors, ...warnings]
  return { findings, total: findings.length }
}

/** `paper/main.tex:52`, the location a row jumps to. */
export function findingLocation(finding: WritingFinding): string {
  return `${finding.file}:${finding.line}`
}
