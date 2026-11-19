import { describe, expect, it } from 'vitest'
import type {
  WritingCheckResult,
  WritingFinding
} from '../../../../shared/research/research-writing-results'
import { writingCheckResultSchema } from '../../../../shared/research/research-writing-results'
import {
  writingCheckChipText,
  writingCheckGroups,
  writingFixFindings
} from './research-writing-check-summary'
import { writingCodeFolderInput, writingQuickActions } from './research-writing-quick-actions'

function finding(code: string, line: number): WritingFinding {
  return {
    code,
    id: null,
    message: code,
    fix: null,
    file: 'paper/main.tex',
    line,
    column: null,
    span: null,
    paragraph: null
  }
}

const profile = {
  words: 500,
  paragraphs: 5,
  sentences: 20,
  citesPer100Words: 0,
  refsPer1kWords: 0,
  hedgesPer1kWords: 0,
  passiveShare: 0.2,
  wePer1kWords: 10
}

const result: WritingCheckResult = {
  manuscript: 'paper/main.tex',
  files: ['paper/main.tex'],
  fragment: false,
  bibliography: { files: ['paper/refs.bib'], keys: 12 },
  claims: { ledger: true, claims: 3 },
  summary: { errors: 2, warnings: 2, notes: 1 },
  sections: [
    {
      role: 'intro',
      title: 'Introduction',
      file: 'paper/main.tex',
      line: 10,
      endLine: 40,
      profile,
      score: 62,
      errors: [finding('WC-CITE-KEY', 30)],
      warnings: [finding('WC-SUPERLATIVE', 12), finding('WC-CITE-DENSITY', 10)],
      notes: [finding('WH-DENSITY', 10)]
    },
    {
      role: 'method',
      title: 'Approach',
      file: 'paper/main.tex',
      line: 41,
      endLine: 80,
      profile,
      score: 100,
      errors: [],
      warnings: [],
      notes: []
    },
    {
      role: 'experiments',
      title: '',
      file: 'paper/exp.tex',
      line: 1,
      endLine: 50,
      profile,
      score: 85,
      errors: [finding('WC-NUMBER', 7)],
      warnings: [],
      notes: []
    }
  ]
}

describe('writing check summary', () => {
  it('says what the header chip shows', () => {
    expect(writingCheckChipText(null)).toBe('Check')
    expect(writingCheckChipText(result)).toBe('2 errors · 2 warnings')
    expect(writingCheckChipText({ ...result, summary: { errors: 0, warnings: 1, notes: 4 } })).toBe(
      '1 warning'
    )
    expect(writingCheckChipText({ ...result, summary: { errors: 0, warnings: 0, notes: 4 } })).toBe(
      'Check passed'
    )
  })

  it('groups findings by section in document order, errors first, each by line', () => {
    const groups = writingCheckGroups(result)
    expect(groups.map((group) => group.title)).toEqual(['Introduction', 'Experiments'])
    expect(groups[0]?.findings.map((row) => `${row.severity}:${row.finding.code}`)).toEqual([
      'error:WC-CITE-KEY',
      'warning:WC-CITE-DENSITY',
      'warning:WC-SUPERLATIVE'
    ])
    expect(groups[0]?.notes).toHaveLength(1)
  })

  it('sends every error before any warning to the agent', () => {
    const { findings, total } = writingFixFindings(result)
    expect(total).toBe(4)
    expect(findings.map((item) => `${item.severity}:${item.code}`)).toEqual([
      'error:WC-CITE-KEY',
      'error:WC-NUMBER',
      'warning:WC-SUPERLATIVE',
      'warning:WC-CITE-DENSITY'
    ])
  })

  it('reads a harness result with missing optional fields', () => {
    const parsed = writingCheckResultSchema.parse({
      manuscript: 'paper/main.tex',
      summary: { errors: 1, warnings: 0, notes: 0 },
      sections: [
        {
          role: 'novel-role',
          file: 'paper/main.tex',
          errors: [
            {
              code: 'WF-UNREFERENCED',
              message: 'Figure never referenced',
              file: 'paper/main.tex',
              line: 3
            }
          ]
        }
      ]
    })
    expect(parsed.sections[0]?.role).toBe('body')
    expect(parsed.sections[0]?.errors[0]).toMatchObject({ fix: null, span: null, column: null })
  })
})

describe('writing quick actions', () => {
  it('say why an action cannot run', () => {
    const reasons = (state: Parameters<typeof writingQuickActions>[0]) =>
      Object.fromEntries(
        writingQuickActions(state).map((action) => [action.id, action.disabledReason])
      )
    expect(reasons({ hasManuscript: true, hasSelection: false, harness: true })).toEqual({
      'method-from-code': null,
      'intro-from-skeleton': null,
      'results-from-runs': null,
      tighten: 'Select a passage in the TeX source first.',
      check: null
    })
    expect(reasons({ hasManuscript: true, hasSelection: true, harness: false }).check).toBe(
      'Writing check runs on local projects only.'
    )
    expect(
      new Set(Object.values(reasons({ hasManuscript: false, hasSelection: true, harness: true })))
    ).toEqual(new Set(['Set the main TeX file first.']))
  })

  it('accept only project-relative folders typed by the person', () => {
    expect(writingCodeFolderInput(' ./src/model/ ')).toBe('src/model')
    expect(writingCodeFolderInput('/etc')).toBe(null)
    expect(writingCodeFolderInput('src/../..')).toBe(null)
    expect(writingCodeFolderInput('  ')).toBe(null)
  })
})
