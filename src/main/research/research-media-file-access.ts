import { realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import { mediaFileType, type MediaFileKind } from '../../shared/media-file-extensions'
import { isDescendantOrEqual } from '../ipc/filesystem-path-containment'

// Why a cap for images only: an <img> decodes the whole file at once, while video and audio stream.
export const MAX_RESEARCH_MEDIA_IMAGE_BYTES = 64 * 1024 * 1024

export type ResearchMediaFile = {
  filePath: string
  kind: MediaFileKind
  mimeType: string
  bytes: number
}

/** A refusal whose message names no path, so blind sample review cannot learn a Run's folder. */
export class ResearchMediaRefusal extends Error {}

const OUTSIDE = 'That media file is outside this project.'
const NOT_MEDIA = 'Only image, video and audio files can be shown.'

function errorCode(cause: unknown): unknown {
  return typeof cause === 'object' && cause !== null ? Reflect.get(cause, 'code') : null
}

async function realFile(requested: string): Promise<string> {
  try {
    return await realpath(requested)
  } catch (cause) {
    throw new ResearchMediaRefusal(
      errorCode(cause) === 'ENOENT'
        ? 'This media file is missing.'
        : 'This media file could not be read.'
    )
  }
}

/**
 * A project media file by its project-relative path. Refuses absolute paths, anything that leaves
 * the project (symlinks included), non-media types and a link whose target is another kind.
 */
export async function resolveResearchMediaFile(
  project: string,
  relativePath: string
): Promise<ResearchMediaFile> {
  if (
    relativePath.includes('\0') ||
    path.posix.isAbsolute(relativePath) ||
    path.win32.isAbsolute(relativePath)
  ) {
    throw new ResearchMediaRefusal('Media paths must be relative to the project.')
  }
  const requested = path.resolve(project, relativePath)
  if (requested === project || !isDescendantOrEqual(requested, project)) {
    throw new ResearchMediaRefusal(OUTSIDE)
  }
  const requestedType = mediaFileType(requested)
  if (!requestedType) {
    throw new ResearchMediaRefusal(NOT_MEDIA)
  }
  const actual = await realFile(requested)
  if (!isDescendantOrEqual(actual, project)) {
    throw new ResearchMediaRefusal(OUTSIDE)
  }
  // Why the target's type too: `sample.png -> notes.txt` must not be served as an image.
  const actualType = mediaFileType(actual)
  if (!actualType || actualType.kind !== requestedType.kind) {
    throw new ResearchMediaRefusal(NOT_MEDIA)
  }
  const details = await stat(actual).catch(() => null)
  if (!details?.isFile()) {
    throw new ResearchMediaRefusal('This media path is not a file.')
  }
  if (actualType.kind === 'image' && details.size > MAX_RESEARCH_MEDIA_IMAGE_BYTES) {
    throw new ResearchMediaRefusal('Images larger than 64 MiB are not shown.')
  }
  return {
    filePath: actual,
    kind: actualType.kind,
    mimeType: actualType.mimeType,
    bytes: details.size
  }
}
