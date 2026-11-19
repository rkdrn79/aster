import * as pdfjsLib from 'pdfjs-dist'
import { decodeBase64Bytes } from '@/lib/fast-base64'
import {
  buildPdfJsDocumentOptions,
  buildPdfJsRangeDocumentOptions
} from './pdf-js-document-options'
import type { PdfDocumentSource } from './pdf-document-source'
import { createPdfRangeTransport } from './pdf-range-transport'
import {
  RangedFileAbortedError,
  RangedFileChangedError,
  type RangedFileProgress
} from './ranged-file'

type PdfLoadingTask = ReturnType<typeof pdfjsLib.getDocument>

/** Base64 content (editor tabs, figure files) or a viewer source (cached or ranged). */
export type PdfLoadInput = string | PdfDocumentSource

export type PdfDocumentLoader = {
  load: (input: PdfLoadInput) => void
  /** The first page painted: the rest of a ranged file may now download in the background. */
  notifyPainted: () => void
  dispose: () => void
}

// Why a fallback: a hidden pane paints nothing, yet the file should still finish downloading.
const BACKGROUND_FILL_FALLBACK_MS = 1500

export function createPdfDocumentLoader({
  display,
  onError,
  onProgress = () => {}
}: {
  display: (doc: pdfjsLib.PDFDocumentProxy) => () => void
  onError: (message: string | null) => void
  /** Bytes loaded of a ranged file, or null once it is whole (or nothing is loading). */
  onProgress?: (progress: RangedFileProgress | null) => void
}): PdfDocumentLoader {
  const tasks = new Map<PdfLoadingTask, () => void>()
  let pending: PdfLoadingTask | null = null
  let displayed: { task: PdfLoadingTask; detach: () => void } | null = null
  let current: PdfDocumentSource | null = null
  let fillTimer: ReturnType<typeof setTimeout> | null = null
  let disposed = false

  const destroy = (task: PdfLoadingTask): void => {
    const release = tasks.get(task)
    if (release) {
      tasks.delete(task)
      release()
      void task.destroy().catch(() => {})
    }
  }
  const fail = (error: unknown): void => {
    onError(
      error instanceof Error && error.name === 'PasswordException'
        ? 'This PDF is password-protected'
        : error instanceof RangedFileChangedError
          ? error.message
          : 'Failed to load PDF preview'
    )
  }
  const clearFillTimer = (): void => {
    if (fillTimer !== null) {
      clearTimeout(fillTimer)
      fillTimer = null
    }
  }
  const startFill = (): void => {
    clearFillTimer()
    current?.ranged?.fillInBackground()
  }
  const openRanged = (input: PdfDocumentSource): PdfOpened | null => {
    const ranged = input.ranged
    if (!ranged) {
      onError('Failed to load PDF preview')
      return null
    }
    const range = createPdfRangeTransport(ranged, (error) => {
      // Why skip an abort: only a superseded read is aborted, and its replacement is on the way.
      if (!disposed && current === input && !(error instanceof RangedFileAbortedError)) {
        fail(error)
      }
    })
    const stopProgress = ranged.onProgress((progress) => {
      if (current === input) {
        onProgress(ranged.isComplete() ? null : progress)
      }
    })
    onProgress(ranged.isComplete() ? null : { loaded: ranged.loadedBytes(), total: ranged.size })
    const task = pdfjsLib.getDocument(
      buildPdfJsRangeDocumentOptions(
        { transport: range.transport, chunkBytes: ranged.blockBytes },
        document.baseURI
      )
    )
    return {
      task,
      release: () => {
        stopProgress()
        range.dispose()
      }
    }
  }
  const open = (input: PdfLoadInput): PdfOpened | null => {
    if (typeof input !== 'string') {
      // Why a copy: pdf.js transfers the buffer to its worker, and the cache keeps this one.
      return input.bytes
        ? {
            task: pdfjsLib.getDocument(
              buildPdfJsDocumentOptions(input.bytes.slice(), document.baseURI)
            ),
            release: () => {}
          }
        : openRanged(input)
    }
    let bytes: Uint8Array
    try {
      bytes = decodeBase64Bytes(input)
    } catch {
      onError('Failed to decode PDF content')
      return null
    }
    return {
      task: pdfjsLib.getDocument(buildPdfJsDocumentOptions(bytes, document.baseURI)),
      release: () => {}
    }
  }

  return {
    load: (input) => {
      if (disposed) {
        return
      }
      if (pending) {
        destroy(pending)
        pending = null
      }
      const previous = displayed
      displayed = null
      try {
        // Why: flush the reader's position before the replacement restores it.
        previous?.detach()
      } finally {
        if (previous) {
          destroy(previous.task)
        }
      }
      clearFillTimer()
      current = typeof input === 'string' ? null : input
      onError(null)
      onProgress(null)
      if (!input) {
        onError('Failed to load PDF preview')
        return
      }
      let opened: PdfOpened | null
      try {
        opened = open(input)
      } catch (error) {
        fail(error)
        return
      }
      if (!opened) {
        return
      }
      const { task } = opened
      tasks.set(task, opened.release)
      pending = task
      void task.promise.then(
        (doc) => {
          if (disposed || pending !== task) {
            return
          }
          pending = null
          try {
            displayed = { task, detach: display(doc) }
            onError(null)
            if (current?.ranged && !current.ranged.isComplete()) {
              fillTimer = setTimeout(startFill, BACKGROUND_FILL_FALLBACK_MS)
            }
          } catch (error) {
            destroy(task)
            fail(error)
          }
        },
        (error: unknown) => {
          if (disposed || pending !== task) {
            return
          }
          pending = null
          destroy(task)
          fail(error)
        }
      )
    },
    notifyPainted: () => {
      if (!disposed && displayed) {
        startFill()
      }
    },
    dispose: () => {
      if (disposed) {
        return
      }
      disposed = true
      pending = null
      current = null
      clearFillTimer()
      try {
        displayed?.detach()
      } finally {
        displayed = null
        // Deleting the entry being visited is safe in a Map iteration.
        for (const task of tasks.keys()) {
          destroy(task)
        }
      }
    }
  }
}

type PdfOpened = { task: PdfLoadingTask; release: () => void }
