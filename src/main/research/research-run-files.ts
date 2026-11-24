import { randomBytes } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { open, readFile, stat } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import {
  RESEARCH_RUN_FILE_NAMES,
  researchRunRelativeSegments,
  type ResearchRecordRoot,
  type ResearchRunLocation
} from '../../shared/research/research-run-reference'
import { projectLayout } from '../../research-harness/research-layout.mjs'
import { remoteRunFiles } from './research-run-remote-files'
import {
  buildRemoteResearchRunReadCommand,
  completeLines,
  parseRemoteResearchRunRead,
  startOffset
} from './research-run-files-remote'

export { buildRemoteResearchRunReadCommand, parseRemoteResearchRunRead }
import { writePluginFileAtomically } from '../plugins/plugin-atomic-file-write'
import { runResearchComputeCommand } from './research-compute-transport'
import { isENOENT } from '../ipc/filesystem-path-containment'

const REMOTE_TIMEOUT_MS = 30_000

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
const MANIFEST_MAX_BYTES = 256 * 1024

export type ResearchRunFileStat = { size: number; mtimeMs: number }

/** Bytes read from `from` up to the last complete line; `nextOffset` is where to resume. */
export type ResearchRunFileChunk = {
  /** Null when the file is not there. */
  stat: ResearchRunFileStat | null
  text: string
  from: number
  nextOffset: number
  /** Why a file that is there could not be read, e.g. `permission denied`. */
  error?: string | null
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

async function readLocalChunk(
  path: string,
  start: ResearchRunReadStart,
  maxBytes: number,
  statOnly: boolean
): Promise<ResearchRunFileChunk> {
  let info
  try {
    info = await stat(path)
  } catch (error) {
    return {
      stat: null,
      text: '',
      from: 0,
      nextOffset: 0,
      ...(isENOENT(error) ? {} : { error: errorText(error) })
    }
  }
  const fileStat = { size: info.size, mtimeMs: info.mtimeMs }
  const from = startOffset(start, info.size, maxBytes)
  if (statOnly || from >= info.size) {
    return { stat: fileStat, text: '', from, nextOffset: from }
  }
  const length = Math.min(maxBytes, info.size - from)
  let handle
  try {
    handle = await open(path, 'r')
  } catch (error) {
    return { stat: fileStat, text: '', from, nextOffset: from, error: errorText(error) }
  }
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
