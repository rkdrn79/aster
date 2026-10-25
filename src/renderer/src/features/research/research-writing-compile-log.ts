const MAX_LOG_CHARS = 500_000

// Tectonic's notes, newest first wins: `note: downloading article.cls`, `note: Running TeX ...`.
const PHASES: readonly (readonly [RegExp, string])[] = [
  [/\b(downloading|connecting to|resolved to)\b/i, 'Downloading TeX packages (one-time)…'],
  [/generating format/i, 'Preparing the TeX format (one-time)…'],
  [/\bRerunning TeX\b/i, 'Typesetting again…'],
  [/\bRunning (BibTeX|biber)\b/i, 'Building the bibliography…'],
  [/\bRunning TeX\b/i, 'Typesetting…'],
  [/\bRunning xdvipdfmx\b/i, 'Writing the PDF…']
]

const LOCATED = /^(error|warning): (.+?\.(?:tex|sty|cls|bib|bbl|ltx)):(\d+): (.+)$/i

export type CompileLogProblem = {
  severity: 'error' | 'warning'
  /** Project-relative TeX path, or null when the engine named a file outside the manuscript folder. */
  sourcePath: string | null
  file: string
  line: number
  message: string
}

/** Keeps the newest output when a runaway build prints more than the dialog should hold. */
export function appendCompileLog(log: string, text: string): string {
  const next = log + text
  return next.length > MAX_LOG_CHARS ? next.slice(-MAX_LOG_CHARS) : next
}

/** What the build is doing now, read from its latest progress note. */
export function compileStatusText(log: string): string {
  const lines = log.split(/\r?\n/)
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const phase = PHASES.find(([pattern]) => pattern.test(lines[index]))
    if (phase) {
      return phase[1]
    }
  }
  return 'Starting Tectonic…'
}

/** A file the engine names relative to the main .tex folder, as a project-relative path. */
export function compileSourcePath(mainSourcePath: string, file: string): string | null {
  if (file.startsWith('/') || /^[A-Za-z]:/.test(file)) {
    return null
  }
  const parts = mainSourcePath.replaceAll('\\', '/').split('/').slice(0, -1)
  for (const part of file.replaceAll('\\', '/').split('/')) {
    if (part === '..') {
      if (!parts.length) {
        return null
      }
      parts.pop()
    } else if (part && part !== '.') {
      parts.push(part)
    }
  }
  return parts.join('/')
}

/** `error: sections/intro.tex:12: Undefined control sequence` lines, errors first. */
export function compileLogProblems(log: string, mainSourcePath: string): CompileLogProblem[] {
  const seen = new Set<string>()
  const problems: CompileLogProblem[] = []
  for (const line of log.split(/\r?\n/)) {
    const match = LOCATED.exec(line.trim())
    if (!match || seen.has(match[0])) {
      continue
    }
    seen.add(match[0])
    problems.push({
      severity: match[1].toLowerCase() === 'error' ? 'error' : 'warning',
      sourcePath: compileSourcePath(mainSourcePath, match[2]),
      file: match[2],
      line: Number(match[3]),
      message: match[4]
    })
  }
  return problems.sort(
    (first, second) => Number(first.severity !== 'error') - Number(second.severity !== 'error')
  )
}
