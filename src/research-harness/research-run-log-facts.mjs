import { open } from 'node:fs/promises'
import { METRIC_LINE_PREFIX } from './research-metric-events.mjs'

const LOG_TAIL_LINES = 20
const LOG_WINDOW_BYTES = 1024 * 1024
const MAX_EXCERPT_CHARS = 2000
// Python's json.dumps writes these bare tokens; JSON.parse rejects them, so run exec drops the line.
const NON_FINITE_TOKEN = /(?<![\w"])(?:NaN|-?Infinity)(?![\w"])/u

async function countNewlines(handle, end) {
  const buffer = Buffer.alloc(Math.min(end, 1024 * 1024))
  let count = 0
  for (let position = 0; position < end;) {
    const { bytesRead } = await handle.read(
      buffer,
      0,
      Math.min(buffer.length, end - position),
      position
    )
    if (bytesRead === 0) {
      break
    }
    for (let index = buffer.indexOf(10); index !== -1 && index < bytesRead;) {
      count += 1
      index = buffer.indexOf(10, index + 1)
    }
    position += bytesRead
  }
  return count
}

function nonFiniteMetricLine(line) {
  if (!line.startsWith(METRIC_LINE_PREFIX)) {
    return false
  }
  const payload = line.slice(METRIC_LINE_PREFIX.length)
  try {
    JSON.parse(payload)
    return false
  } catch {
    return NON_FINITE_TOKEN.test(payload)
  }
}

function excerptOf(lines) {
  const kept = [...lines]
  while (kept.length > 1 && kept.join('\n').length > MAX_EXCERPT_CHARS) {
    kept.shift()
  }
  const text = kept.join('\n')
  return { dropped: lines.length - kept.length, excerpt: text.slice(-MAX_EXCERPT_CHARS) }
}

/**
 * The log's last lines and its ASTER_METRIC lines carrying NaN/Infinity, from the final 1 MiB.
 * Why bounded: checks rerun on every refresh; divergence shows up near the end of a log.
 */
export async function readLogFacts(file, { tail }) {
  const handle = await open(file, 'r').catch(() => null)
  if (!handle) {
    return null
  }
  try {
    const { size } = await handle.stat()
    if (size === 0) {
      return null
    }
    const start = Math.max(0, size - LOG_WINDOW_BYTES)
    const buffer = Buffer.alloc(size - start)
    await handle.read(buffer, 0, buffer.length, start)
    const segments = buffer.toString('utf8').split('\n')
    if (segments.at(-1) === '') {
      segments.pop()
    }
    // A window that starts mid-file begins with a partial line.
    const first = start > 0 ? 1 : 0
    const lines = segments.map((segment) => segment.replace(/\r$/u, ''))
    const nonFinite = []
    for (let index = first; index < lines.length; index += 1) {
      if (nonFiniteMetricLine(lines[index])) {
        nonFinite.push(index)
      }
    }
    if (!tail && nonFinite.length === 0) {
      return null
    }
    const offset = 1 + (start > 0 ? await countNewlines(handle, start) : 0)
    const lineEvidence = (from, to) => {
      const { dropped, excerpt } = excerptOf(lines.slice(from, to + 1))
      return { fromLine: offset + from + dropped, toLine: offset + to, excerpt }
    }
    const last = lines.length - 1
    return {
      tail:
        tail && last >= first
          ? lineEvidence(Math.max(first, last - LOG_TAIL_LINES + 1), last)
          : null,
      nonFinite: nonFinite.length
        ? { ...lineEvidence(nonFinite[0], nonFinite[0]), count: nonFinite.length }
        : null
    }
  } finally {
    await handle.close()
  }
}
