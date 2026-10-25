import { z } from 'zod'
import type { ResearchRunRecord } from '../../../../shared/research/research-records'
import {
  RESEARCH_MEDIA_KINDS,
  type ResearchMediaKind
} from '../../../../shared/research/research-run-media'
import { mediaFileType } from '../../../../shared/media-file-extensions'
import { relativePathInsideRoot, resolveRuntimePath } from '../../../../shared/cross-platform-path'
import { readResearchTextFile } from './research-file-reader'

/** One `media` entry of a sample row, its path as written (relative to the outputs file's folder). */
export type QualitativeSampleMedia = {
  kind: ResearchMediaKind
  path: string
  label: string | null
}

export type QualitativeSample = {
  sampleId: string
  prompt: string | null
  output: string | null
  imagePath: string | null
  media: QualitativeSampleMedia[]
}

export type QualitativeOutputs = {
  samples: QualitativeSample[]
  errorRows: number
  truncated: boolean
}

const MAX_OUTPUT_SOURCE_BYTES = 5 * 1024 * 1024
const MAX_SAMPLES = 500
const MAX_TEXT_LENGTH = 10_000
const MAX_SAMPLE_MEDIA = 16

const mediaEntrySchema = z
  .object({
    kind: z.enum(RESEARCH_MEDIA_KINDS).optional(),
    path: z.string().min(1).max(4096),
    label: z.string().max(200).nullable().optional()
  })
  .transform((entry, context) => {
    // Why: like an ASTER_MEDIA line, an entry may leave the kind to its extension.
    const kind = entry.kind ?? mediaFileType(entry.path)?.kind
    if (!kind) {
      context.addIssue({ code: 'custom', message: 'unknown media kind' })
      return z.NEVER
    }
    return { kind, path: entry.path, label: entry.label?.trim() || null }
  })

const sampleRowSchema = z.object({
  sampleId: z
    .string()
    .max(256)
    .refine((id) => id.trim().length > 0),
  prompt: z.string().max(MAX_TEXT_LENGTH).optional(),
  output: z.string().max(MAX_TEXT_LENGTH).optional(),
  imagePath: z.string().max(4096).optional(),
  media: z.array(mediaEntrySchema).max(MAX_SAMPLE_MEDIA).optional()
})

/** Explicit sample IDs align model outputs; missing or malformed records never become empty outputs. */
export function parseQualitativeOutputs(content: string): QualitativeOutputs {
  const samples: QualitativeSample[] = []
  const seen = new Set<string>()
  let errorRows = 0
  let truncated = false
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) {
      continue
    }
    if (samples.length === MAX_SAMPLES) {
      truncated = true
      break
    }
    if (line.length > 1024 * 1024) {
      errorRows += 1
      continue
    }
    let row: unknown
    try {
      row = JSON.parse(line)
    } catch {
      errorRows += 1
      continue
    }
    const parsed = sampleRowSchema.safeParse(row)
    if (!parsed.success || seen.has(parsed.data.sampleId)) {
      errorRows += 1
      continue
    }
    const { sampleId, prompt, output, imagePath, media = [] } = parsed.data
    if (output === undefined && !imagePath && media.length === 0) {
      errorRows += 1
      continue
    }
    seen.add(sampleId)
    samples.push({
      sampleId,
      prompt: prompt ?? null,
      output: output ?? null,
      imagePath: imagePath || null,
      media
    })
  }
  return { samples, errorRows, truncated }
}

/**
 * A sample's media file as the media IPC takes it: project paths to try in order, empty when every
 * candidate is outside the workspace.
 */
export type SampleMediaFile = {
  kind: ResearchMediaKind
  label: string | null
  projectPaths: string[]
}

/**
 * The outputs file's folder first (plan C6), then the workspace root, where Aster has always
 * looked for `imagePath`; the harness media index tries the same two in the same order.
 */
function candidateProjectPaths(
  workspacePath: string,
  folder: string | null,
  target: string
): string[] {
  const bases = folder ? [folder, workspacePath] : [workspacePath]
  const paths = bases.map((base) =>
    relativePathInsideRoot(workspacePath, resolveRuntimePath(base, target))
  )
  return [...new Set(paths.filter((path): path is string => Boolean(path)))]
}

/** The legacy `imagePath` image first, then the `media` entries. */
export function sampleMediaFiles(
  run: Pick<ResearchRunRecord, 'workspacePath' | 'outputsPath'>,
  sample: QualitativeSample
): SampleMediaFile[] {
  const folder = run.outputsPath ? resolveRuntimePath(run.outputsPath, '..') : null
  const entries: QualitativeSampleMedia[] = sample.imagePath
    ? [{ kind: 'image', path: sample.imagePath, label: null }, ...sample.media]
    : sample.media
  return entries.map((entry) => ({
    kind: entry.kind,
    label: entry.label,
    projectPaths: candidateProjectPaths(run.workspacePath, folder, entry.path)
  }))
}

export async function readQualitativeOutputs(
  run: ResearchRunRecord
): Promise<QualitativeOutputs | null> {
  if (!run.outputsPath) {
    return null
  }
  return parseQualitativeOutputs(
    await readResearchTextFile(run, run.outputsPath, MAX_OUTPUT_SOURCE_BYTES)
  )
}
