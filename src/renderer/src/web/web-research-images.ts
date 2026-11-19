import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { buildImageDataUri } from '../../../shared/image-data-uri'
import type { RuntimeFilePreviewResult } from '../../../shared/runtime-file-contracts'

// Why local: in the web client the local target is the paired host that owns the workspace.
const HOST = { kind: 'local' } as const
const CACHED = 48

const cache = new Map<string, string>()

/**
 * A workspace image (PNG, JPEG, SVG, …) as a data URI, through the host's file preview; the host
 * caps its size for a paired client. Kept briefly so scrolling back does not read it again.
 */
export async function readHostImage(
  worktreeId: string,
  relativePath: string,
  options: { fresh?: boolean } = {}
): Promise<string> {
  const key = `${worktreeId}\0${relativePath}`
  const cached = options.fresh ? undefined : cache.get(key)
  if (cached) {
    return cached
  }
  const preview = await callRuntimeRpc<RuntimeFilePreviewResult>(HOST, 'files.readPreview', {
    worktree: `id:${worktreeId}`,
    relativePath
  })
  const uri = preview.isImage ? buildImageDataUri(preview.mimeType, preview.content) : null
  if (!uri) {
    throw new Error(
      `${relativePath.split('/').at(-1) ?? relativePath} is not an image this phone can show.`
    )
  }
  cache.delete(key)
  cache.set(key, uri)
  if (cache.size > CACHED) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) {
      cache.delete(oldest)
    }
  }
  return uri
}
