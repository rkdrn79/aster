export const MEDIA_FILE_MIME_TYPES: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.flac': 'audio/flac',
  '.opus': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm'
}

export const MEDIA_PREVIEW_SCHEME = 'orca-media'

// Why raster only: an SVG is a document that can carry script, not an output image.
const MEDIA_IMAGE_MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp'
}

export type MediaFileKind = 'image' | 'video' | 'audio'

/** A file's media kind and MIME type by its extension, or null for anything else. */
export function mediaFileType(filePath: string): { kind: MediaFileKind; mimeType: string } | null {
  const extension = /\.[^./\\]+$/.exec(filePath)?.[0].toLowerCase()
  if (!extension) {
    return null
  }
  const image = MEDIA_IMAGE_MIME_TYPES[extension]
  if (image) {
    return { kind: 'image', mimeType: image }
  }
  const mimeType = MEDIA_FILE_MIME_TYPES[extension]
  if (!mimeType) {
    return null
  }
  return { kind: mimeType.startsWith('video/') ? 'video' : 'audio', mimeType }
}
