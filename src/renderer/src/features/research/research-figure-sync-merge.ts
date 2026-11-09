import { CaptureUpdateAction, newElementWith, restore } from '@excalidraw/excalidraw'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { BinaryFileData, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { toast } from 'sonner'
import {
  repairFigureScene,
  type FigureElement
} from '../../../../research-harness/research-figures-model.mjs'
import { parseFigureText } from './research-figure-document'
import { diffFigureElements } from './research-figure-diff'
import {
  mergeFigureElements,
  resolveFigureConflicts,
  type FigureMergeConflict
} from './research-figure-merge'
import { replaceFigureScene } from './research-figure-scene-replace'
import { keepWrittenTextSize } from './research-figure-text-fonts'

export type FigureCaptureMode = 'immediately' | 'never'

/** Every element gets a new version, so Excalidraw's history sees a file's change even when the
 *  writer (a kit script, a hand edit) kept the old version numbers. */
function bumped(elements: readonly ExcalidrawElement[]): ExcalidrawElement[] {
  return elements.map((element) => newElementWith(element, {}, true))
}

const fontReady = (font: string, text: string): boolean => document.fonts.check(font, text)

/**
 * Once the fonts some text waited for are in, draws that text again: Excalidraw keeps each
 * element's picture until the element changes, and one drawn in the fallback would stay.
 */
function redrawWhenLoaded(api: ExcalidrawImperativeAPI, waiting: Map<string, Set<string>>): void {
  const ids = new Set([...waiting.values()].flatMap((set) => [...set]))
  void Promise.allSettled([...waiting.keys()].map((font) => document.fonts.load(font))).then(() =>
    replaceFigureScene(api, () =>
      api.updateScene({
        // Why a copy: a new object at the same version is drawn afresh without being an edit.
        elements: api
          .getSceneElementsIncludingDeleted()
          .map((element) => (ids.has(element.id) ? { ...element } : element)),
        captureUpdate: CaptureUpdateAction.NEVER
      })
    )
  )
}

/** Says which elements a scene lost because their geometry was not numbers (see repairFigureScene). */
export function warnFigureRepairs(repairs: readonly string[]): void {
  if (repairs.length) {
    toast.warning(`Left out ${repairs.length} broken element${repairs.length === 1 ? '' : 's'}`, {
      description: `${repairs.slice(0, 3).join('; ')}${repairs.length > 3 ? '; …' : ''}. The rest of the figure is shown; rerun the script that drew them.`
    })
  }
}

/** Puts scene elements (and files) on the canvas through Excalidraw's own sanitizer. */
export function applyFigureScene(
  api: ExcalidrawImperativeAPI,
  scene: { elements: readonly unknown[]; files?: Record<string, unknown> },
  capture: FigureCaptureMode = 'immediately'
): void {
  // Why: a NaN coordinate an agent's script wrote (null on disk) must not take the canvas down.
  const { scene: repaired, repairs } = repairFigureScene(scene)
  warnFigureRepairs(repairs)
  // Why the JSON round trip: restore() is Excalidraw's own sanitizer for scenes from disk.
  const data = restore(JSON.parse(JSON.stringify(repaired)), null, null, {
    refreshDimensions: true,
    repairBindings: true
  })
  // Why: restore measured text in whatever font was in; one still loading keeps the kit's size.
  const measured = keepWrittenTextSize(bumped(data.elements), scene.elements, fontReady)
  replaceFigureScene(api, () => {
    api.updateScene({
      elements: measured.elements,
      captureUpdate:
        capture === 'never' ? CaptureUpdateAction.NEVER : CaptureUpdateAction.IMMEDIATELY
    })
    const files: BinaryFileData[] = Object.values(data.files)
    if (files.length) {
      api.addFiles(files)
    }
  })
  if (measured.waiting.size) {
    redrawWhenLoaded(api, measured.waiting)
  }
}

/**
 * Folds an agent turn into one undo step: the canvas goes back to how it was before the agent's
 * first write without being recorded, then forward to now as a single recorded change.
 */
export function foldIntoOneStep(
  api: ExcalidrawImperativeAPI,
  before: readonly ExcalidrawElement[]
): void {
  const now = api.getSceneElementsIncludingDeleted()
  replaceFigureScene(api, () => {
    api.updateScene({ elements: bumped(before), captureUpdate: CaptureUpdateAction.NEVER })
    api.updateScene({ elements: bumped(now), captureUpdate: CaptureUpdateAction.IMMEDIATELY })
  })
}

function canvasElements(api: ExcalidrawImperativeAPI): FigureElement[] {
  return api.getSceneElements().map((element) => ({ ...element }))
}

/** Ids an agent write added or changed on the canvas, for the 1.5 s flash. */
export function changedOnCanvas(
  before: readonly ExcalidrawElement[],
  api: ExcalidrawImperativeAPI
): string[] {
  const diff = diffFigureElements(
    before.map((element) => ({ ...element })),
    canvasElements(api)
  )
  return [...diff.added, ...diff.changed]
}

/**
 * Three-way merges the agent's file into the canvas: `baseText` is what the canvas started from.
 * Applies what merges cleanly as one undo step and returns the overlaps for a person to decide.
 */
export function mergeDiskIntoCanvas(
  api: ExcalidrawImperativeAPI,
  baseText: string,
  diskText: string
): { conflicts: FigureMergeConflict[]; fromAgent: number } {
  const agent = parseFigureText(diskText)
  const result = mergeFigureElements({
    base: parseFigureText(baseText).elements,
    mine: canvasElements(api),
    agent: agent.elements
  })
  applyFigureScene(api, { elements: result.elements, files: agent.files })
  return { conflicts: result.conflicts, fromAgent: result.fromAgent }
}

/** Applies the per-element picks of a merge review to the canvas as one undo step. */
export function applyMergeChoices(
  api: ExcalidrawImperativeAPI,
  conflicts: readonly FigureMergeConflict[],
  choices: Readonly<Record<string, 'mine' | 'agent'>>
): void {
  applyFigureScene(api, {
    elements: resolveFigureConflicts(canvasElements(api), conflicts, choices),
    files: {}
  })
}
