export type LogLineKind = 'metric' | 'error' | 'plain'
export type LogLine = { text: string; kind: LogLineKind }

// Why: the harness parses these into curves and media; in the log they bury the training output.
const HARNESS_LINE = /^\s*ASTER_(?:METRIC|MEDIA)\b/
const TRACEBACK_START = /^\s*Traceback \(most recent call last\)/
const ERROR_LINE =
  /\b\w*(?:Error|Exception)\b|\bNaN\b|\bnan\b|out of memory|\bOOM\b|\bKilled\b|Segmentation fault|core dumped|\bFATAL\b|^panic:/

/** Each line of a log tail, with Python tracebacks marked as errors from header to exception. */
export function classifyLogLines(text: string): LogLine[] {
  const lines = text ? text.replace(/\r?\n$/, '').split(/\r?\n/) : []
  let inTraceback = false
  return lines.map((line): LogLine => {
    if (HARNESS_LINE.test(line)) {
      return { text: line, kind: 'metric' }
    }
    if (TRACEBACK_START.test(line)) {
      inTraceback = true
      return { text: line, kind: 'error' }
    }
    if (inTraceback) {
      // Indented frames belong to the traceback; the first unindented line is the exception.
      inTraceback = /^\s/.test(line)
      return { text: line, kind: 'error' }
    }
    return { text: line, kind: ERROR_LINE.test(line) ? 'error' : 'plain' }
  })
}

/** Lines left after hiding harness lines and filtering by a case-insensitive search. */
export function filterLogLines(
  lines: LogLine[],
  { showMetricLines, query }: { showMetricLines: boolean; query: string }
): LogLine[] {
  const search = query.trim().toLowerCase()
  return lines.filter(
    (line) =>
      (showMetricLines || line.kind !== 'metric') &&
      (!search || line.text.toLowerCase().includes(search))
  )
}
