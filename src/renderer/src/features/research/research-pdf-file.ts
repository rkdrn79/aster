import type { PdfDocumentSource } from '@/components/editor/pdf-document-source'
import { createRangedFile, type RangedFile } from '@/components/editor/ranged-file'
import { runtimeFileBlockReader, statRuntimeReadTarget } from '@/runtime/runtime-file-range-client'
import {
  createPdfFileCache,
  samePdfFileVersion,
  type PdfFileCache,
  type PdfFileVersion
} from './research-pdf-file-cache'
import { createIndexedDbPdfFileStore } from './research-pdf-file-store'
import {
  manuscriptReadTarget,
  type ManuscriptFile,
  type ResearchWorkspaceFileOwner
} from './research-writing-source'

const DEFAULT_MAX_PDF_BYTES = 24 * 1024 * 1024
// Why: below a few blocks, range requests cost more round trips than reading everything at once.
const WHOLE_READ_MAX_BLOCKS = 4
// Why 64 KiB (pdf.js's own default chunk): a page's fonts and images sit in scattered objects,
// and on a 2 MB/s link each needless 384 KiB read of one small object costs a third of a second.
const RANGE_GRID_BYTES = 64 * 1024
// The header (and a linearized file's first page) and the cross-reference table at the end.
const EDGE_PREFETCH_BYTES = 128 * 1024
// Why: a released, half-read file resumes if its paper is reopened soon; a few at most.
const MAX_PARKED_READS = 2

/** A PDF opened for the viewer; release it when the viewer no longer shows it. */
export type ManuscriptPdfSource = PdfDocumentSource & {
  mtime: number
  /** The whole file, fetching the rest first if needed. */
  whole: () => Promise<Uint8Array>
  release: () => void
}

type LiveRead = { version: PdfFileVersion; ranged: RangedFile; users: number }

let sharedCache: PdfFileCache | null = null
const liveReads = new Map<string, LiveRead>()

function pdfFileCache(): PdfFileCache {
  sharedCache ??= createPdfFileCache({
    memoryBudgetBytes: 96 * 1024 * 1024,
    storeBudgetBytes: 256 * 1024 * 1024,
    store: typeof indexedDB === 'undefined' ? null : createIndexedDbPdfFileStore(indexedDB)
  })
  return sharedCache
}

/** Test seam: a fresh cache and no reads in flight. */
export function resetManuscriptPdfFilesForTests(cache: PdfFileCache | null = null): void {
  sharedCache = cache
  for (const live of liveReads.values()) {
    live.ranged.abort()
  }
  liveReads.clear()
}

function assertPdfHeader(bytes: Uint8Array): void {
  if (bytes.length < 5 || new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-') {
    throw new Error('The selected file is not a PDF.')
  }
}

function parkReleasedReads(): void {
  const parked = [...liveReads].filter(([, live]) => live.users === 0)
  for (const [key, live] of parked.slice(0, Math.max(0, parked.length - MAX_PARKED_READS))) {
    liveReads.delete(key)
    live.ranged.abort()
  }
}

/** A ranged read of one file version, shared by every viewer of it and cached once whole. */
function startRead(
  key: string,
  version: PdfFileVersion,
  reader: ReturnType<typeof runtimeFileBlockReader>,
  verify: () => Promise<PdfFileVersion>
): LiveRead {
  const ranged = createRangedFile({
    size: version.size,
    blockBytes: Math.min(RANGE_GRID_BYTES, reader.blockBytes),
    maxReadBytes: reader.blockBytes,
    concurrency: reader.concurrency,
    readBlock: reader.read
  })
  const live: LiveRead = { version, ranged, users: 0 }
  liveReads.set(key, live)
  void ranged.complete.then(
    async (bytes) => {
      // Why: blocks are separate reads, so a rewrite between them (a PDF rebuild) splices two
      // versions; only a file unchanged from first block to last may be cached.
      const after = await verify().catch(() => null)
      if (after && samePdfFileVersion(after, version)) {
        await pdfFileCache().put(key, version, bytes, reader.remote)
      }
      if (liveReads.get(key) === live) {
        liveReads.delete(key)
      }
    },
    () => {
      if (liveReads.get(key) === live) {
        liveReads.delete(key)
      }
    }
  )
  return live
}

/**
 * Opens a workspace PDF for viewing: from the cache when unchanged, else as a ranged read whose
 * first and last blocks (header, cross-reference table) are requested first.
 */
export async function openManuscriptPdf(
  owner: ResearchWorkspaceFileOwner,
  file: ManuscriptFile,
  maxBytes = DEFAULT_MAX_PDF_BYTES
): Promise<ManuscriptPdfSource> {
  const args = manuscriptReadTarget(owner, file)
  const reader = runtimeFileBlockReader(args)
  const stat = async (): Promise<PdfFileVersion> => {
    const snapshot = await statRuntimeReadTarget(args)
    return { size: snapshot.size, mtime: snapshot.mtime, ctime: snapshot.ctime }
  }
  const snapshot = await statRuntimeReadTarget(args)
  if (snapshot.isDirectory) {
    throw new Error('Choose a file, not a directory.')
  }
  if (snapshot.size > maxBytes) {
    throw new Error(
      `Preview exceeds the ${maxBytes / 1024 / 1024} MiB limit. Open the file in the editor.`
    )
  }
  const version: PdfFileVersion = {
    size: snapshot.size,
    mtime: snapshot.mtime,
    ctime: snapshot.ctime
  }
  const key = JSON.stringify([
    owner.hostId,
    owner.workspaceId,
    owner.workspacePath,
    file.absolutePath
  ])
  const sourceKey = JSON.stringify([key, version.size, version.mtime, version.ctime ?? null])
  const cached = await pdfFileCache().get(key, version, reader.remote)
  if (cached) {
    assertPdfHeader(cached)
    return wholeSource(sourceKey, version, cached)
  }
  const existing = liveReads.get(key)
  let live = existing
  if (!live || !samePdfFileVersion(live.version, version)) {
    // Why: an older version still on screen keeps loading for its viewer until released.
    if (existing?.users === 0) {
      existing.ranged.abort()
    }
    live = startRead(key, version, reader, stat)
  }
  const { ranged } = live
  live.users += 1
  const releaseUse = (): void => {
    live.users -= 1
    if (live.users > 0 || ranged.isComplete()) {
      return
    }
    if (liveReads.get(key) === live) {
      ranged.pauseBackground()
      parkReleasedReads()
    } else {
      ranged.abort()
    }
  }
  try {
    const edge = Math.min(EDGE_PREFETCH_BYTES, reader.blockBytes)
    const head = ranged.read(0, Math.min(version.size, edge))
    // The tail holds the cross-reference table pdf.js reads right after the header.
    void ranged.read(Math.max(0, version.size - edge), version.size).catch(() => {})
    if (version.size <= reader.blockBytes * WHOLE_READ_MAX_BLOCKS) {
      void head.catch(() => {})
      ranged.fillInBackground()
      const bytes = await ranged.complete
      assertPdfHeader(bytes)
      releaseUse()
      return wholeSource(sourceKey, version, bytes)
    }
    assertPdfHeader(await head)
  } catch (error) {
    releaseUse()
    throw error
  }
  let released = false
  return {
    key: sourceKey,
    size: version.size,
    mtime: version.mtime,
    bytes: null,
    ranged,
    whole: () => {
      ranged.fillInBackground()
      return ranged.complete
    },
    release: () => {
      if (!released) {
        released = true
        releaseUse()
      }
    }
  }
}

function wholeSource(key: string, version: PdfFileVersion, bytes: Uint8Array): ManuscriptPdfSource {
  return {
    key,
    size: version.size,
    mtime: version.mtime,
    bytes,
    ranged: null,
    whole: () => Promise.resolve(bytes),
    release: () => {}
  }
}

/** The whole PDF, for callers that need every byte (page counts, metadata, downloads). */
export async function readManuscriptPdf(
  owner: ResearchWorkspaceFileOwner,
  file: ManuscriptFile,
  maxBytes = DEFAULT_MAX_PDF_BYTES
): Promise<{ bytes: Uint8Array; size: number; mtime: number }> {
  const source = await openManuscriptPdf(owner, file, maxBytes)
  try {
    return { bytes: await source.whole(), size: source.size, mtime: source.mtime }
  } finally {
    source.release()
  }
}
