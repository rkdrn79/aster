import { createReadStream } from 'node:fs'
import { lstat } from 'node:fs/promises'
import path from 'node:path'
import readline from 'node:readline'
import { HarnessError } from './research-harness-error.mjs'

export const RUN_OUTPUTS_FILE = 'outputs.jsonl'
const MAX_OUTPUTS_FILE_BYTES = 200 * 1024 * 1024
const MAX_ROW_MEDIA = 16
const MAX_PATH_LENGTH = 4096

/** The Run folder's outputs.jsonl (rows: sampleId, prompt?, output?, imagePath?, media?). */
export function runOutputsPath(runDirectory) {
  return path.join(runDirectory, RUN_OUTPUTS_FILE)
}

function outputText(value, max) {
  return typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : null
}

/**
 * Media one outputs.jsonl row names: its `media: [{kind, path, label?}]` entries and a legacy
 * `imagePath` image. Paths stay as written, relative to the outputs file's folder.
 */
function rowMedia(row, sampleId) {
  const items = []
  for (const entry of Array.isArray(row.media) ? row.media.slice(0, MAX_ROW_MEDIA) : []) {
    const file = outputText(entry?.path, MAX_PATH_LENGTH)
    if (file) {
      items.push({
        kind: outputText(entry.kind, 16),
        path: file,
        label: outputText(entry.label, 200),
        sampleId
      })
    }
  }
  const image = outputText(row.imagePath, MAX_PATH_LENGTH)
  if (image) {
    items.push({ kind: 'image', path: image, label: null, sampleId })
  }
  return items
}

/**
 * Sample IDs and up to `mediaLimit` named media files of the Run's outputs.jsonl, read in one
 * pass, or null when the Run has no such file.
 */
export async function readRunOutputs(runDirectory, { mediaLimit = 0 } = {}) {
  const file = runOutputsPath(runDirectory)
  const details = await lstat(file).catch((error) => {
    if (error?.code === 'ENOENT') {
      return null
    }
    throw error
  })
  if (!details) {
    return null
  }
  if (!details.isFile() || details.size > MAX_OUTPUTS_FILE_BYTES) {
    throw new HarnessError(
      'invalid_layout',
      `${RUN_OUTPUTS_FILE} must be a file of at most 200 MiB: ${file}`
    )
  }
  const sampleIds = new Set()
  const media = []
  let mediaTruncated = false
  const lines = readline.createInterface({
    input: createReadStream(file, 'utf8'),
    crlfDelay: Infinity
  })
  for await (const line of lines) {
    if (!line.trim()) {
      continue
    }
    let row
    try {
      row = JSON.parse(line)
    } catch {
      // Malformed rows carry no sample; the Compare view reports them separately.
      continue
    }
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      continue
    }
    const sampleId = typeof row.sampleId === 'string' && row.sampleId.trim() ? row.sampleId : null
    if (sampleId) {
      sampleIds.add(sampleId)
    }
    if (mediaLimit > 0 && !mediaTruncated) {
      for (const item of rowMedia(row, sampleId)) {
        if (media.length >= mediaLimit) {
          mediaTruncated = true
          break
        }
        media.push(item)
      }
    }
  }
  return { sampleIds, media, mediaTruncated }
}

/** Sample IDs in the Run's outputs.jsonl, or null when the Run has no such file. */
export async function readRunOutputSampleIds(runDirectory) {
  return (await readRunOutputs(runDirectory))?.sampleIds ?? null
}
