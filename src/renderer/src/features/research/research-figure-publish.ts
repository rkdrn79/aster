import { toast } from 'sonner'
import {
  figurePublicationPath,
  paperCopyPath,
  parsePublicationRecord,
  publicationRecord,
  type FigurePublication
} from '../../../../research-harness/research-figures-locations.mjs'
import { figureFilePaths } from '../../../../research-harness/research-figures-model.mjs'
import { bytesSha256, sceneSha256 } from './research-figure-document'
import { readFigurePreviewHash } from './research-figure-preview'
import { useFigureEditorHandle, type FigureEditorHandle } from './research-figure-editor-handle'
import { editorFor } from './research-figure-overwrite'
import { selectFigure } from './research-figures-store'
import {
  base64ToBytes,
  deleteProjectPath,
  isMissingProjectFile,
  moveProjectPath,
  projectRecordRoot,
  readProjectFile,
  readProjectText,
  writeProjectBinary,
  writeProjectText,
  type ProjectFileOwner
} from './research-project-files'

/** The paper already has a PDF of this name that did not come from this figure. */
export class FigurePublishConflict extends Error {
  readonly path: string

  constructor(path: string) {
    super(`${path} already exists and did not come from this figure.`)
    this.name = 'FigurePublishConflict'
    this.path = path
  }
}

export async function readFigurePublication(
  owner: ProjectFileOwner,
  slug: string
): Promise<FigurePublication | null> {
  const path = figurePublicationPath(await projectRecordRoot(owner), slug)
  return parsePublicationRecord(await readProjectText(owner, path).catch(() => ''))
}

async function bytesOrNull(owner: ProjectFileOwner, path: string): Promise<Uint8Array | null> {
  try {
    const file = await readProjectFile(owner, path)
    return file.isBinary ? base64ToBytes(file.content) : new TextEncoder().encode(file.content)
  } catch (cause) {
    if (isMissingProjectFile(cause)) {
      return null
    }
    throw cause
  }
}

export type FigurePublishResult = {
  pdf: string
  /** Puts back what the paper had before (or removes the copy this publish created). */
  undo: () => Promise<void>
}

/**
 * Copies a figure's vector PDF to the manuscript's figures folder and records what it was made
 * from. Refuses a PDF already there that this figure did not put there, unless `replace`.
 */
export async function publishFigureCopy(input: {
  owner: ProjectFileOwner
  slug: string
  /** Project-relative PDF in the working folder. */
  from: string
  manuscript: string
  /** Hash of the scene the PDF was made from; null for a plot. */
  sceneSha256: string | null
  replace?: boolean
}): Promise<FigurePublishResult> {
  const { owner, slug, from, manuscript } = input
  const pdf = paperCopyPath(manuscript, slug)
  const root = await projectRecordRoot(owner)
  const recordPath = figurePublicationPath(root, slug)
  const [bytes, existing, previousText] = await Promise.all([
    bytesOrNull(owner, from),
    bytesOrNull(owner, pdf),
    readProjectText(owner, recordPath).catch(() => null)
  ])
  if (!bytes) {
    throw new Error(`${from} has not been written yet. Open the figure so Aster can export it.`)
  }
  const pdfSha256 = await bytesSha256(bytes)
  if (existing && !input.replace) {
    const existingSha = await bytesSha256(existing)
    const previous = previousText ? parsePublicationRecord(previousText) : null
    if (existingSha !== pdfSha256 && existingSha !== previous?.pdfSha256) {
      throw new FigurePublishConflict(pdf)
    }
  }
  await writeProjectBinary(owner, pdf, bytes)
  const record = publicationRecord({
    slug,
    pdf,
    pdfSha256,
    sceneSha256: input.sceneSha256,
    publishedAt: new Date().toISOString()
  })
  await writeProjectText(owner, recordPath, `${JSON.stringify(record, null, 2)}\n`)
  return {
    pdf,
    undo: async () => {
      await (existing ? writeProjectBinary(owner, pdf, existing) : deleteProjectPath(owner, pdf))
      await (previousText
        ? writeProjectText(owner, recordPath, previousText)
        : deleteProjectPath(owner, recordPath))
    }
  }
}

/** Saves the open figure and makes sure its PDF shows the saved scene; false when it could not. */
export async function refreshFigureExports(handle: FigureEditorHandle): Promise<boolean> {
  // Why retries: an autosave already running refuses this save.
  let saved = await handle.save()
  for (let tries = 0; !saved && tries < 20; tries += 1) {
    await new Promise((resolve) => setTimeout(resolve, 200))
    saved = await handle.save()
  }
  if (!saved) {
    return false
  }
  const { target } = handle
  const text = await readProjectText(
    target.owner,
    figureFilePaths(target.folder, target.slug).scene
  )
  const hash = await sceneSha256(text)
  const shown = (): Promise<string | null> =>
    readFigurePreviewHash(target.owner, target.slug, readProjectText)
  if ((await shown()) === hash) {
    return true
  }
  await handle.exportNow()
  return (await shown()) === hash
}

/**
 * Publishes the figure on the canvas: saves it, makes sure its PDF shows the current scene, and
 * copies that PDF. Throws when the figure cannot be saved or exported.
 */
export async function publishOpenFigure(
  handle: FigureEditorHandle,
  manuscript: string,
  replace = false
): Promise<FigurePublishResult> {
  const { target } = handle
  if (!(await refreshFigureExports(handle))) {
    throw new Error('The figure could not be saved or exported. Resolve the message on the canvas.')
  }
  const files = figureFilePaths(target.folder, target.slug)
  const text = await readProjectText(target.owner, files.scene)
  return publishFigureCopy({
    owner: target.owner,
    slug: target.slug,
    from: files.pdf,
    manuscript,
    sceneSha256: await sceneSha256(text),
    replace
  })
}

/** Whether the working PDF shows the scene on disk, so it can be published without opening it. */
export async function figureExportsCurrent(
  owner: ProjectFileOwner,
  files: { folder: string; slug: string }
): Promise<{ current: boolean; sceneSha256: string | null }> {
  const text = await readProjectText(owner, figureFilePaths(files.folder, files.slug).scene).catch(
    () => null
  )
  if (text === null) {
    return { current: false, sceneSha256: null }
  }
  const [hash, preview] = await Promise.all([
    sceneSha256(text),
    readFigurePreviewHash(owner, files.slug, readProjectText)
  ])
  return { current: preview === hash, sceneSha256: hash }
}

/**
 * Publishes a figure from the list: as it is on the canvas when open, right away when its PDF
 * already shows the scene on disk, otherwise opening it so Aster renders the current version.
 */
export async function publishListedFigure(
  owner: ProjectFileOwner,
  files: { folder: string; slug: string },
  manuscript: string,
  replace = false
): Promise<FigurePublishResult> {
  const open = useFigureEditorHandle.getState().handle
  if (open?.target.slug === files.slug) {
    return publishOpenFigure(open, manuscript, replace)
  }
  const { current, sceneSha256: hash } = await figureExportsCurrent(owner, files)
  if (current) {
    return publishFigureCopy({
      owner,
      slug: files.slug,
      from: figureFilePaths(files.folder, files.slug).pdf,
      manuscript,
      sceneSha256: hash,
      replace
    })
  }
  selectFigure(owner, { kind: 'figure', slug: files.slug })
  const handle = await editorFor(files.slug)
  if (!handle) {
    throw new Error('The figure did not open. Open it from the list and try again.')
  }
  return publishOpenFigure(handle, manuscript, replace)
}

/**
 * A published figure's rename: its copy and record follow the new name, so an updated manuscript
 * finds the file. When the manuscript keeps the old name, the copy stays too and the record goes.
 */
export async function renamePublishedCopy(
  owner: ProjectFileOwner,
  input: { from: string; to: string; manuscript: string; follow: boolean }
): Promise<void> {
  const root = await projectRecordRoot(owner)
  const fromRecord = figurePublicationPath(root, input.from)
  const record = parsePublicationRecord(await readProjectText(owner, fromRecord).catch(() => ''))
  if (!record) {
    return
  }
  if (!input.follow) {
    await deleteProjectPath(owner, fromRecord)
    return
  }
  const fromPdf = paperCopyPath(input.manuscript, input.from)
  const toPdf = paperCopyPath(input.manuscript, input.to)
  if ((await bytesOrNull(owner, toPdf)) !== null) {
    throw new Error(`${toPdf} already exists.`)
  }
  if ((await bytesOrNull(owner, fromPdf)) !== null) {
    await moveProjectPath(owner, fromPdf, toPdf)
  }
  await writeProjectText(
    owner,
    figurePublicationPath(root, input.to),
    `${JSON.stringify({ ...record, slug: input.to, pdf: toPdf }, null, 2)}\n`
  )
  await deleteProjectPath(owner, fromRecord)
}

/**
 * A title change rewrites the scene file but not what prints, so a copy that was current stays
 * current: the record follows the file.
 */
export async function keepPublicationCurrent(
  owner: ProjectFileOwner,
  slug: string,
  before: string,
  after: string
): Promise<void> {
  const path = figurePublicationPath(await projectRecordRoot(owner), slug)
  const record = parsePublicationRecord(await readProjectText(owner, path).catch(() => ''))
  if (record && record.sceneSha256 === (await sceneSha256(before))) {
    await writeProjectText(
      owner,
      path,
      `${JSON.stringify({ ...record, sceneSha256: await sceneSha256(after) }, null, 2)}\n`
    )
  }
}

/** A toast saying what was copied, with Undo. */
export function toastPublished(result: FigurePublishResult, what: string): void {
  toast.success(`${what} ${result.pdf}.`, {
    action: {
      label: 'Undo',
      onClick: () =>
        void result
          .undo()
          .then(() => toast('The paper is back to the copy it had.'))
          .catch((cause: unknown) =>
            toast.error(`Undo failed. ${cause instanceof Error ? cause.message : String(cause)}`)
          )
    }
  })
}

/** Offers to replace a PDF the figure did not put there; `publish` runs again with replace. */
export function toastPublishConflict(
  cause: FigurePublishConflict,
  publish: () => Promise<unknown>
): void {
  toast.error(`${cause.path} already exists and did not come from this figure.`, {
    action: { label: 'Replace it', onClick: () => void publish() }
  })
}
