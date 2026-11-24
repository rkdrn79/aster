import { Buffer } from 'node:buffer'
import {
  RESEARCH_RECORD_ROOTS,
  type ResearchRunLocation
} from '../../shared/research/research-run-reference'
import { remoteRunFiles } from './research-run-remote-files'
import type {
  ResearchRunFileChunk,
  ResearchRunFileStat,
  ResearchRunFilesRead,
  ResearchRunReadRequest,
  ResearchRunReadStart
} from './research-run-files'

const MANIFEST_MAX_BYTES = 256 * 1024

/** Keeps whole lines: bytes after the last newline may be a line still being written. */
export function completeLines(
  text: string,
  from: number,
  start: ResearchRunReadStart
): { text: string; nextOffset: number } {
  let body = text
  let skipped = 0
  if (start === 'tail' && from > 0) {
    const firstBreak = body.indexOf('\n')
    skipped = firstBreak === -1 ? Buffer.byteLength(body, 'utf8') : firstBreak + 1
    body = firstBreak === -1 ? '' : body.slice(firstBreak + 1)
  }
  const lastBreak = body.lastIndexOf('\n')
  const kept = lastBreak === -1 ? '' : body.slice(0, lastBreak + 1)
  return { text: kept, nextOffset: from + skipped + Buffer.byteLength(kept, 'utf8') }
}

export function startOffset(start: ResearchRunReadStart, size: number, maxBytes: number): number {
  if (start === 'tail') {
    return Math.max(0, size - maxBytes)
  }
  // A file that shrank was rewritten; read it again from the top.
  return start > size ? 0 : start
}

/**
 * `quoted` is a shell word for the file, already quoted. A missing file prints nothing (its stat
 * line says so); one that is there but cannot be read prints an error mark instead of looking empty.
 */
function remoteChunkCommand(
  quoted: string,
  start: ResearchRunReadStart,
  maxBytes: number,
  errorMark: string
): string {
  const read =
    start === 'tail'
      ? `tail -c ${maxBytes} ${quoted}`
      : // `tail -c +N` counts from 1; a shrunk file is re-read from its start, as locally.
        `s=$(stat -c %s ${quoted} 2>/dev/null || echo 0); o=${start}; [ "$o" -gt "$s" ] && o=0; tail -c +$((o + 1)) ${quoted} | head -c ${maxBytes}`
  return `if [ -e ${quoted} ] && [ ! -r ${quoted} ]; then printf '${errorMark}\\tpermission denied\\n'; elif [ -e ${quoted} ]; then ${read} 2>/dev/null || printf '\\n${errorMark}\\tread failed\\n'; fi`
}

/** One ssh exec reads all three files; a per-read nonce keeps file text from faking a marker. */
export function buildRemoteResearchRunReadCommand(
  location: ResearchRunLocation,
  request: ResearchRunReadRequest,
  nonce: string
): string {
  const files = remoteRunFiles(location)
  const mark = `@@aster-${nonce}`
  const statLine = (name: string, quoted: string): string =>
    `if [ -f ${quoted} ]; then printf '${mark}-stat\\t${name}\\t%s\\t%s\\n' "$(stat -c %s ${quoted})" "$(stat -c %Y ${quoted})"; else printf '${mark}-stat\\t${name}\\t-\\t-\\n'; fi`
  const section = (name: string, body: string): string =>
    `printf '${mark}-file\\t${name}\\n'; ${body}; printf '\\n${mark}-end\\n'`
  const parts = [
    ...(files.prelude ? [files.prelude] : []),
    `printf '${mark}-root\\t%s\\n' ${files.root}`,
    statLine('manifest', files.manifest),
    statLine('metrics', files.metrics),
    statLine('log', files.log),
    section('manifest', `head -c ${MANIFEST_MAX_BYTES} ${files.manifest} 2>/dev/null`)
  ]
  if (!request.statOnly) {
    parts.push(
      section(
        'metrics',
        remoteChunkCommand(
          files.metrics,
          request.metricsFrom,
          request.maxBytes,
          `${mark}-error\\tmetrics`
        )
      ),
      section(
        'log',
        remoteChunkCommand(
          files.log,
          request.logFrom,
          request.logMaxBytes ?? request.maxBytes,
          `${mark}-error\\tlog`
        )
      )
    )
  }
  return parts.join('; ')
}

export function parseRemoteResearchRunRead(
  stdout: string,
  request: ResearchRunReadRequest,
  nonce: string
): ResearchRunFilesRead {
  const mark = `@@aster-${nonce}`
  const stats = new Map<string, ResearchRunFileStat | null>()
  for (const match of stdout.matchAll(
    new RegExp(`^${mark}-stat\\t(\\w+)\\t(\\S+)\\t(\\S+)$`, 'gm')
  )) {
    const size = Number(match[2])
    const mtime = Number(match[3])
    stats.set(
      match[1],
      Number.isFinite(size) && Number.isFinite(mtime) ? { size, mtimeMs: mtime * 1000 } : null
    )
  }
  const sections = new Map<string, string>()
  const errors = new Map<string, string>()
  const errorLine = new RegExp(`(?:^|\\n)${mark}-error\\t(\\w+)\\t([^\\n]*)(?=\\n|$)`, 'g')
  for (const match of stdout.matchAll(
    new RegExp(`^${mark}-file\\t(\\w+)\\n([\\s\\S]*?)\\n${mark}-end$`, 'gm')
  )) {
    let body = match[2]
    for (const error of body.matchAll(errorLine)) {
      errors.set(error[1], error[2])
    }
    body = body.replace(errorLine, '')
    sections.set(match[1], body)
  }
  const chunk = (
    name: string,
    start: ResearchRunReadStart,
    maxBytes: number
  ): ResearchRunFileChunk => {
    const fileStat = stats.get(name) ?? null
    const error = errors.get(name) ?? null
    if (!fileStat) {
      return { stat: null, text: '', from: 0, nextOffset: 0, ...(error ? { error } : {}) }
    }
    const from = startOffset(start, fileStat.size, maxBytes)
    const text = sections.get(name) ?? ''
    if (request.statOnly || !text || error) {
      return { stat: fileStat, text: '', from, nextOffset: from, ...(error ? { error } : {}) }
    }
    return { stat: fileStat, from, ...completeLines(text, from, start) }
  }
  const manifestStat = stats.get('manifest') ?? null
  const manifestText = sections.get('manifest')
  const root = new RegExp(`^${mark}-root\\t(\\S+)$`, 'm').exec(stdout)?.[1]
  return {
    recordRoot: RESEARCH_RECORD_ROOTS.find((item) => item === root) ?? RESEARCH_RECORD_ROOTS[0],
    manifest:
      manifestStat && manifestText !== undefined && manifestStat.size <= MANIFEST_MAX_BYTES
        ? { content: manifestText, stat: manifestStat }
        : null,
    metrics: chunk('metrics', request.metricsFrom, request.maxBytes),
    log: chunk('log', request.logFrom, request.logMaxBytes ?? request.maxBytes)
  }
}
