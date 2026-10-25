import { mediaFileType } from '../../../../shared/media-file-extensions'
import type { ResearchAnalysisItem } from '../../../../shared/research/research-analysis'

/** The analyses the notebook shows: readable, not superseded, newest first. */
export function currentAnalyses(
  items: readonly (ResearchAnalysisItem | null)[]
): ResearchAnalysisItem[] {
  return items
    .filter((item): item is ResearchAnalysisItem => item !== null && !item.supersededBy)
    .toSorted((left, right) => right.at.localeCompare(left.at))
}

/** `file` is a recorded file Aster cannot preview, such as a video or a PDF figure. */
export type AnalysisPreviewKind = 'figure' | 'table' | 'note' | 'file'

function extension(path: string): string {
  return /\.([^./\\]+)$/.exec(path)?.[1]?.toLowerCase() ?? ''
}

/** How the file previews: by what it is on disk, else by the kind the agent recorded. */
export function analysisPreviewKind(
  item: Pick<ResearchAnalysisItem, 'kind' | 'file'>
): AnalysisPreviewKind {
  const media = mediaFileType(item.file)
  if (media) {
    return media.kind === 'image' ? 'figure' : 'file'
  }
  const ext = extension(item.file)
  if (ext === 'csv' || ext === 'tsv' || ext === 'json') {
    return 'table'
  }
  if (ext === 'md' || ext === 'txt' || ext === 'tex') {
    return 'note'
  }
  return item.kind === 'figure' ? 'file' : 'note'
}

/** One delimited line, honoring double-quoted fields. */
function splitDelimited(line: string, delimiter: string): string[] {
  const cells: string[] = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (quoted) {
      if (char === '"' && line[index + 1] === '"') {
        cell += '"'
        index += 1
      } else if (char === '"') {
        quoted = false
      } else {
        cell += char
      }
    } else if (char === '"' && cell === '') {
      quoted = true
    } else if (char === delimiter) {
      cells.push(cell)
      cell = ''
    } else {
      cell += char
    }
  }
  cells.push(cell)
  return cells
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }
  return typeof value === 'string' ? value : JSON.stringify(value)
}

export type AnalysisTable = { columns: string[]; rows: string[][]; total: number }

function jsonTable(content: string): Omit<AnalysisTable, 'total'> | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return null
  }
  if (Array.isArray(parsed)) {
    if (parsed.every((row) => Array.isArray(row))) {
      const width = Math.max(0, ...parsed.map((row) => (Array.isArray(row) ? row.length : 0)))
      return {
        columns: Array.from({ length: width }, (_, index) => String(index + 1)),
        rows: parsed.map((row) => (Array.isArray(row) ? row.map(cellText) : []))
      }
    }
    const records = parsed.filter(
      (row): row is Record<string, unknown> =>
        Boolean(row) && typeof row === 'object' && !Array.isArray(row)
    )
    const columns = [...new Set(records.flatMap((row) => Object.keys(row)))]
    return { columns, rows: records.map((row) => columns.map((column) => cellText(row[column]))) }
  }
  if (parsed && typeof parsed === 'object') {
    return {
      columns: ['Key', 'Value'],
      rows: Object.entries(parsed).map(([key, value]) => [key, cellText(value)])
    }
  }
  return null
}

/** A CSV, TSV, or JSON table's columns and its first `maxRows` rows; null when unreadable. */
export function parseAnalysisTable(
  content: string,
  path: string,
  maxRows: number
): AnalysisTable | null {
  const ext = extension(path)
  let table: Omit<AnalysisTable, 'total'> | null
  if (ext === 'json') {
    table = jsonTable(content)
  } else {
    const delimiter = ext === 'tsv' ? '\t' : ','
    const lines = content.split(/\r?\n/u).filter((line) => line.trim() !== '')
    const [header, ...body] = lines
    table = header
      ? {
          columns: splitDelimited(header, delimiter),
          rows: body.map((line) => splitDelimited(line, delimiter))
        }
      : null
  }
  if (!table || !table.columns.length) {
    return null
  }
  return { columns: table.columns, rows: table.rows.slice(0, maxRows), total: table.rows.length }
}

/** The first `lines` lines of a note, and whether more follow. */
export function analysisNoteExcerpt(
  content: string,
  lines: number
): { text: string; more: boolean } {
  const all = content.trim().split(/\r?\n/u)
  return { text: all.slice(0, lines).join('\n'), more: all.length > lines }
}
