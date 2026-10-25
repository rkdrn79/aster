import { describe, expect, it } from 'vitest'
import type { ResearchAnalysisItem } from '../../../../shared/research/research-analysis'
import {
  analysisPreviewKind,
  currentAnalyses,
  parseAnalysisTable
} from './research-analysis-preview'

function analysis(
  id: string,
  at: string,
  supersededBy: string | null = null
): ResearchAnalysisItem {
  return {
    id,
    at,
    experiment: 'exp',
    title: id,
    kind: 'note',
    file: `research/experiments/exp/analysis/${id}.md`,
    summary: '',
    runs: [],
    by: 'agent',
    supersededBy
  }
}

describe('Analysis previews', () => {
  it('shows current analyses newest first', () => {
    const items = currentAnalyses([
      analysis('old', '2026-10-24T08:00:00Z'),
      null,
      analysis('replaced', '2026-10-24T09:00:00Z', 'new'),
      analysis('new', '2026-10-24T10:00:00Z')
    ])
    expect(items.map((item) => item.id)).toEqual(['new', 'old'])
  })

  it('previews by the file on disk before the recorded kind', () => {
    expect(analysisPreviewKind({ kind: 'note', file: 'a/loss.png' })).toBe('figure')
    expect(analysisPreviewKind({ kind: 'figure', file: 'a/loss.pdf' })).toBe('file')
    expect(analysisPreviewKind({ kind: 'note', file: 'a/seeds.tsv' })).toBe('table')
    expect(analysisPreviewKind({ kind: 'table', file: 'a/table.tex' })).toBe('note')
  })

  it('reads the first rows of CSV with quoted fields, TSV, and JSON tables', () => {
    expect(
      parseAnalysisTable('run,note,acc\nbase,"a, b",0.8\ncand,"say ""hi""",0.83\n', 'x.csv', 1)
    ).toEqual({ columns: ['run', 'note', 'acc'], rows: [['base', 'a, b', '0.8']], total: 2 })
    expect(parseAnalysisTable('run\tacc\ncand\t0.83', 'x.tsv', 5)?.rows).toEqual([['cand', '0.83']])
    expect(
      parseAnalysisTable('[{"run":"base","acc":0.8},{"run":"cand","seeds":3}]', 'x.json', 5)
    ).toEqual({
      columns: ['run', 'acc', 'seeds'],
      rows: [
        ['base', '0.8', ''],
        ['cand', '', '3']
      ],
      total: 2
    })
    expect(parseAnalysisTable('{"acc":0.8}', 'x.json', 5)?.rows).toEqual([['acc', '0.8']])
    expect(parseAnalysisTable('not json', 'x.json', 5)).toBeNull()
  })
})
