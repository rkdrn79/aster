import { randomBytes } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { open, readFile, stat } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import {
  RESEARCH_RECORD_ROOTS,
  RESEARCH_RUN_FILE_NAMES,
  researchRunRelativeSegments,
  type ResearchRecordRoot,
  type ResearchRunLocation
} from '../../shared/research/research-run-reference'
import { projectLayout } from '../../research-harness/research-layout.mjs'
import { remoteRunFiles } from './research-run-remote-files'
import { writePluginFileAtomically } from '../plugins/plugin-atomic-file-write'
import { runResearchComputeCommand } from './research-compute-transport'

const REMOTE_TIMEOUT_MS = 30_000
const MANIFEST_MAX_BYTES = 256 * 1024

export type ResearchRunFileStat = { size: number; mtimeMs: number }

/** Bytes read from `from` up to the last complete line; `nextOffset` is where to resume. */
export type ResearchRunFileChunk = {
  stat: ResearchRunFileStat | null
  text: string
  from: number
  nextOffset: number
}

export type ResearchRunFilesRead = {
  /** The record tree the files were read from (ADR-004 `.aster`, or a pre-ADR-004 `research`). */
  recordRoot: ResearchRecordRoot
  /** `content` is null when run.json still matches the request's `manifestKnown`. */
  manifest: { content: string | null; stat: ResearchRunFileStat } | null
  metrics: ResearchRunFileChunk
  log: ResearchRunFileChunk
}

/** `tail`: the last `maxBytes` of the file, starting at a line boundary. */
export type ResearchRunReadStart = number | 'tail'

export type ResearchRunReadRequest = {
  metricsFrom: ResearchRunReadStart
  logFrom: ResearchRunReadStart
  maxBytes: number
  /** A smaller window for the log, e.g. when only its last lines are shown. */
  logMaxBytes?: number
  /** Skip the content read when only sizes are wanted. */
  statOnly?: boolean
  /** run.json as last read; an unchanged local file is not read again. */
  manifestKnown?: ResearchRunFileStat | null
}

function localRecordRoot(location: ResearchRunLocation): ResearchRecordRoot {
  return location.recordRoot ?? projectLayout(location.projectPath).root
}

export function localResearchRunPath(
  location: ResearchRunLocation,
  file: keyof typeof RESEARCH_RUN_FILE_NAMES | null
): string {
  if (!isAbsolute(location.projectPath)) {
    throw new Error(`The project path must be absolute: ${location.projectPath}`)
  }
  const dir = join(
    location.projectPath,
    ...researchRunRelativeSegments(location, localRecordRoot(location))
  )
  return file ? join(dir, RESEARCH_RUN_FILE_NAMES[file]) : dir
}

/** Keeps whole lines: bytes after the last newline may be a line still being written. */
function completeLines(
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

function startOffset(start: ResearchRunReadStart, size: number, maxBytes: number): number {
  if (start === 'tail') {
    return Math.max(0, size - maxBytes)
  }
  // A file that shrank was rewritten; read it again from the top.
  return start > size ? 0 : start
}

async function readLocalChunk(
  path: string,
  start: ResearchRunReadStart,
  maxBytes: number,
  statOnly: boolean
): Promise<ResearchRunFileChunk> {
  let info
  try {
    info = await stat(path)
  } catch {
    return { stat: null, text: '', from: 0, nextOffset: 0 }
  }
  const fileStat = { size: info.size, mtimeMs: info.mtimeMs }
  const from = startOffset(start, info.size, maxBytes)
  if (statOnly || from >= info.size) {
    return { stat: fileStat, text: '', from, nextOffset: from }
  }
  const length = Math.min(maxBytes, info.size - from)
  const handle = await open(path, 'r')
  try {
    const buffer = Buffer.alloc(length)
    const { bytesRead } = await handle.read(buffer, 0, length, from)
    const decoded = buffer.subarray(0, bytesRead).toString('utf8')
    return { stat: fileStat, ...completeLines(decoded, from, start), from }
  } finally {
    await handle.close()
  }
}

async function readLocalRunFiles(
  location: ResearchRunLocation,
  request: ResearchRunReadRequest
): Promise<ResearchRunFilesRead> {
  const manifestPath = localResearchRunPath(location, 'manifest')
  let manifest: ResearchRunFilesRead['manifest'] = null
  try {
    const info = await stat(manifestPath)
    const known = request.manifestKnown
    const fileStat = { size: info.size, mtimeMs: info.mtimeMs }
    if (known && known.size === info.size && known.mtimeMs === info.mtimeMs) {
      manifest = { content: null, stat: fileStat }
    } else if (info.size <= MANIFEST_MAX_BYTES) {
      manifest = { content: await readFile(manifestPath, 'utf8'), stat: fileStat }
    }
  } catch {
    manifest = null
  }
  const [metrics, log] = await Promise.all([
    readLocalChunk(
      localResearchRunPath(location, 'metrics'),
      request.metricsFrom,
      request.maxBytes,
      request.statOnly ?? false
    ),
    readLocalChunk(
      localResearchRunPath(location, 'log'),
      request.logFrom,
      request.logMaxBytes ?? request.maxBytes,
      request.statOnly ?? false
    )
  ])
  return { recordRoot: localRecordRoot(location), manifest, metrics, log }
}

/** `quoted` is a shell word for the file, already quoted. */
function remoteChunkCommand(quoted: string, start: ResearchRunReadStart, maxBytes: number): string {
  if (start === 'tail') {
    return `tail -c ${maxBytes} ${quoted} 2>/dev/null`
  }
  // `tail -c +N` counts from 1; a shrunk file is re-read from its start, as locally.
  return `s=$(stat -c %s ${quoted} 2>/dev/null || echo 0); o=${start}; [ "$o" -gt "$s" ] && o=0; tail -c +$((o + 1)) ${quoted} 2>/dev/null | head -c ${maxBytes}`
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
      section('metrics', remoteChunkCommand(files.metrics, request.metricsFrom, request.maxBytes)),
      section(
        'log',
        remoteChunkCommand(files.log, request.logFrom, request.logMaxBytes ?? request.maxBytes)
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
  for (const match of stdout.matchAll(
    new RegExp(`^${mark}-file\\t(\\w+)\\n([\\s\\S]*?)\\n${mark}-end$`, 'gm')
  )) {
    sections.set(match[1], match[2])
  }
  const chunk = (
    name: string,
    start: ResearchRunReadStart,
    maxBytes: number
  ): ResearchRunFileChunk => {
    const fileStat = stats.get(name) ?? null
    if (!fileStat) {
      return { stat: null, text: '', from: 0, nextOffset: 0 }
    }
    const from = startOffset(start, fileStat.size, maxBytes)
    const text = sections.get(name) ?? ''
    if (request.statOnly || !text) {
      return { stat: fileStat, text: '', from, nextOffset: from }
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

export type ResearchRunReadResult =
  | { ok: true; read: ResearchRunFilesRead }
  | { ok: false; message: string }

export async function readResearchRunFiles(
  location: ResearchRunLocation,
  request: ResearchRunReadRequest
): Promise<ResearchRunReadResult> {
  if (location.targetId === null) {
    try {
      return { ok: true, read: await readLocalRunFiles(location, request) }
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) }
    }
  }
  const nonce = randomBytes(6).toString('hex')
  const result = await runResearchComputeCommand(
    location.targetId,
    true,
    buildRemoteResearchRunReadCommand(location, request, nonce),
    REMOTE_TIMEOUT_MS
  )
  if (result.status !== 'ok') {
    return {
      ok: false,
      message: result.status === 'error' ? result.message : 'The host is not connected.'
    }
  }
  return { ok: true, read: parseRemoteResearchRunRead(result.stdout, request, nonce) }
}

/**
 * Replaces run.json only if it is still the file that was read; a launcher that wrote it in
 * between keeps its write, and the caller re-reads on its next pass.
 */
export async function writeResearchRunManifest(
  location: ResearchRunLocation,
  content: string,
  expected: ResearchRunFileStat
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (location.targetId === null) {
    const path = localResearchRunPath(location, 'manifest')
    try {
      const current = await stat(path)
      if (current.size !== expected.size || current.mtimeMs !== expected.mtimeMs) {
        return { ok: false, message: 'run.json changed while it was being updated.' }
      }
      await writePluginFileAtomically(path, content)
      return { ok: true }
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) }
    }
  }
  const files = remoteRunFiles(location)
  const path = files.manifest
  const command = [
    ...(files.prelude ? [files.prelude] : []),
    `s=$(stat -c '%s %Y' ${path} 2>/dev/null)`,
    `[ "$s" = '${expected.size} ${Math.floor(expected.mtimeMs / 1000)}' ] || { echo 'aster: run.json changed'; exit 3; }`,
    `t=${path}.aster-$$`,
    `cat > "$t" && mv -f "$t" ${path}`
  ].join('; ')
  const result = await runResearchComputeCommand(
    location.targetId,
    true,
    command,
    REMOTE_TIMEOUT_MS,
    content
  )
  return result.status === 'ok'
    ? { ok: true }
    : {
        ok: false,
        message: result.status === 'error' ? result.message : 'The host is not connected.'
      }
}
