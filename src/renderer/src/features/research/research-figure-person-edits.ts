import {
  applyPersonEdits,
  emptyPersonEdits,
  parsePersonEdits,
  prunePersonEdits,
  recordPersonEdits,
  type PersonEditOverride,
  type PersonEdits
} from '../../../../research-harness/research-figures-person-edits.mjs'
import { personEditReport } from '../../../../research-harness/research-figures-person-words.mjs'
import {
  figureFilePaths,
  figurePreviewPaths,
  type FigureElement
} from '../../../../research-harness/research-figures-model.mjs'
import { noteFigurePersonEdits } from './research-figure-cowork-store'
import { figureFileText, parseFigureText } from './research-figure-document'
import type { FigureTarget } from './research-figures-export'
import {
  ProjectWriteConflict,
  projectRecordRoot,
  readProjectText,
  writeProjectText
} from './research-project-files'

const ledgerPath = (target: FigureTarget): string =>
  figureFilePaths(target.folder, target.slug).edits

async function readLedger(
  target: FigureTarget
): Promise<{ ledger: PersonEdits | null; text: string | null }> {
  let text: string
  try {
    text = await readProjectText(target.owner, ledgerPath(target))
  } catch {
    return { ledger: null, text: null }
  }
  try {
    return { ledger: parsePersonEdits(JSON.parse(text)), text }
  } catch {
    return { ledger: null, text }
  }
}

function publish(
  target: FigureTarget,
  ledger: PersonEdits | null,
  overrode: readonly PersonEditOverride[] = []
): void {
  const words = personEditReport(ledger, { overrode })
  noteFigurePersonEdits(
    target,
    words.count || words.overrode.length
      ? { count: words.count, lines: words.kept, overrode: words.overrode }
      : null
  )
}

/** Reads the figure's hand edits for the Figures page; null when the person made none. */
export async function loadFigurePersonEdits(target: FigureTarget): Promise<PersonEdits | null> {
  const { ledger } = await readLedger(target)
  publish(target, ledger)
  return ledger?.edits.length ? ledger : null
}

async function writeLedger(
  target: FigureTarget,
  update: (ledger: PersonEdits) => PersonEdits
): Promise<PersonEdits | null> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { ledger, text } = await readLedger(target)
    const next = update(ledger ?? emptyPersonEdits())
    const nextText = figureFileText(next)
    if ((text === null && !next.edits.length) || text === nextText) {
      return next
    }
    try {
      await writeProjectText(target.owner, ledgerPath(target), nextText, text)
      return next
    } catch (cause) {
      if (!(cause instanceof ProjectWriteConflict)) {
        throw cause
      }
    }
  }
  return null
}

/**
 * After the person saved: adds what they changed on the canvas (`touched` ids only) and drops
 * what they undid (a restored version, the agent's side picked in a review).
 */
export async function recordFigurePersonEdits(
  target: FigureTarget,
  input: { baseText: string; savedText: string; touched: ReadonlySet<string> }
): Promise<void> {
  const before = parseFigureText(input.baseText)
  const after = parseFigureText(input.savedText)
  if (before.issues.length || after.issues.length) {
    return
  }
  const next = await writeLedger(target, (ledger) =>
    prunePersonEdits(
      input.touched.size
        ? recordPersonEdits(ledger, {
            before: before.elements,
            after: after.elements,
            files: after.files,
            touched: input.touched
          })
        : ledger,
      after.elements
    )
  )
  if (next) {
    publish(target, next)
  }
}

/** Lets the agent's script set these again (the person's "Forget" on the Figures page). */
export async function forgetFigurePersonEdits(
  target: FigureTarget,
  ids: readonly string[] | null
): Promise<void> {
  const gone = ids ? new Set(ids) : null
  const next = await writeLedger(target, (ledger) => ({
    ...ledger,
    edits: gone ? ledger.edits.filter((entry) => !gone.has(entry.id)) : []
  }))
  publish(target, next)
}

type ParsedScene = {
  raw: Record<string, unknown>
  scene: { elements: FigureElement[]; files: Record<string, unknown> }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isElementList(value: unknown): value is FigureElement[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) => isRecord(entry) && typeof entry.id === 'string' && typeof entry.type === 'string'
    )
  )
}

/** The file's own object (written back as it is, only the edited fields changed) and its scene. */
function sceneOf(text: string): ParsedScene | null {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return null
  }
  if (!isRecord(value) || !isElementList(value.elements)) {
    return null
  }
  return {
    raw: value,
    scene: { elements: value.elements, files: isRecord(value.files) ? value.files : {} }
  }
}

/**
 * An agent wrote the scene (a script run, a hand-written JSON): puts the person's edits back where
 * the file lost them and writes it, unless the agent is writing again meanwhile. Returns the text
 * now on disk and whether it changed.
 */
export async function keepFigurePersonEdits(
  target: FigureTarget,
  diskText: string
): Promise<{ text: string; changed: boolean }> {
  const { ledger } = await readLedger(target)
  const parsed = ledger?.edits.length ? sceneOf(diskText) : null
  if (!ledger || !parsed) {
    return { text: diskText, changed: false }
  }
  const { changed, report } = applyPersonEdits(parsed.scene, ledger)
  publish(target, ledger, report.overrode)
  if (!changed) {
    return { text: diskText, changed: false }
  }
  const text = figureFileText({
    ...parsed.raw,
    elements: parsed.scene.elements,
    ...(Object.keys(parsed.scene.files).length || 'files' in parsed.raw
      ? { files: parsed.scene.files }
      : {})
  })
  try {
    await writeProjectText(
      target.owner,
      figureFilePaths(target.folder, target.slug).scene,
      text,
      diskText
    )
  } catch (cause) {
    if (cause instanceof ProjectWriteConflict) {
      return { text: diskText, changed: false }
    }
    throw cause
  }
  await writeFigureKeptReport(target, report.overrode, report.gone)
  return { text, changed: true }
}

/** What `figures check` tells the agent later: what its write changed that the person had set. */
export async function writeFigureKeptReport(
  target: FigureTarget,
  overrode: readonly PersonEditOverride[],
  gone: readonly { id: string; label: string }[] = []
): Promise<void> {
  const kept = figurePreviewPaths(await projectRecordRoot(target.owner), target.slug).kept
  await writeProjectText(
    target.owner,
    kept,
    figureFileText({ at: new Date().toISOString(), overrode, gone })
  ).catch(() => undefined)
}
