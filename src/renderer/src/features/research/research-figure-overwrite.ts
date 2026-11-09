import { create } from 'zustand'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import {
  PAGE_FRAME_ID,
  figureFilePaths,
  figurePage,
  newFigureScene
} from '../../../../research-harness/research-figures-model.mjs'
import { figureFileText } from './research-figure-document'
import { useFigureEditorHandle, type FigureEditorHandle } from './research-figure-editor-handle'
import type { FigureRequestHost } from './research-figure-prompt-context'
import { refreshFigureList, selectFigure, useResearchFigures } from './research-figures-store'
import {
  ProjectWriteConflict,
  writeProjectText,
  type ProjectFileOwner
} from './research-project-files'

/** What to do with a request that redraws a figure that already has a drawing. */
export type FigureOverwriteChoice = 'new' | 'redraw' | 'cancel'

type PromptState = {
  pending: { request: string; resolve: (choice: FigureOverwriteChoice) => void } | null
}

export const useFigureOverwritePrompt = create<PromptState>(() => ({ pending: null }))

/** Asks where a redrawing request should draw; the dialog is ResearchFigureOverwriteDialog. */
export function askFigureOverwrite(request: string): Promise<FigureOverwriteChoice> {
  useFigureOverwritePrompt.getState().pending?.resolve('cancel')
  return new Promise((resolve) => {
    useFigureOverwritePrompt.setState({ pending: { request, resolve } })
  })
}

export function answerFigureOverwrite(choice: FigureOverwriteChoice): void {
  const pending = useFigureOverwritePrompt.getState().pending
  useFigureOverwritePrompt.setState({ pending: null })
  pending?.resolve(choice)
}

/** Anything on the canvas besides the empty page. */
export function figureHasDrawing(api: ExcalidrawImperativeAPI): boolean {
  return api.getSceneElements().some((element) => element.id !== PAGE_FRAME_ID)
}

/** `<slug>-2`, `<slug>-3`… the first name the figures folder does not use yet. */
export function freeFigureSlug(base: string, taken: ReadonlySet<string>): string {
  const stem = base.replace(/-\d+$/, '').slice(0, 56) || 'figure'
  for (let index = 2; ; index += 1) {
    const slug = `${stem}-${index}`
    if (!taken.has(slug)) {
      return slug
    }
  }
}

/** Writes a new figure file with this text and opens it; returns its slug. */
export async function createFigureFromText(
  owner: ProjectFileOwner,
  folder: string,
  baseSlug: string,
  text: string
): Promise<string> {
  const taken = new Set(useResearchFigures.getState().listing.figures.map((entry) => entry.slug))
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slug = freeFigureSlug(baseSlug, taken)
    try {
      await writeProjectText(owner, figureFilePaths(folder, slug).scene, text, null)
      await refreshFigureList(owner)
      selectFigure(owner, { kind: 'figure', slug })
      return slug
    } catch (error) {
      if (!(error instanceof ProjectWriteConflict)) {
        throw error
      }
      taken.add(slug)
    }
  }
  throw new Error('No free name for the new figure.')
}

/** Resolves once the editor shows `slug`, or null after a few seconds. */
function editorFor(slug: string): Promise<FigureEditorHandle | null> {
  const current = useFigureEditorHandle.getState().handle
  if (current?.target.slug === slug) {
    return Promise.resolve(current)
  }
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      stop()
      resolve(null)
    }, 15_000)
    const stop = useFigureEditorHandle.subscribe(({ handle }) => {
      if (handle?.target.slug === slug) {
        window.clearTimeout(timer)
        stop()
        resolve(handle)
      }
    })
  })
}

/**
 * Opens a new figure beside the open one for a redraw: a blank page of the same size, or a copy
 * when the request works from what is drawn (a sketch). Returns the host to send it from.
 */
export async function openRedrawFigure(
  host: FigureRequestHost,
  copy: boolean
): Promise<FigureRequestHost | null> {
  const { api, target } = host
  if (!api || !target) {
    return null
  }
  const { figureSceneText } = await import('./research-figures-export')
  const page = figurePage(api.getSceneElements())
  const text = copy
    ? figureSceneText(api)
    : figureFileText(
        newFigureScene(
          page ? { widthIn: page.widthIn, heightIn: page.heightIn } : null,
          Math.random,
          page?.style ?? null
        )
      )
  const slug = await createFigureFromText(target.owner, target.folder, target.slug, text)
  const handle = await editorFor(slug)
  return handle ? { ...host, api: handle.api, target: handle.target, save: handle.save } : null
}

/**
 * For a request that redraws the figure: when the canvas has a drawing, asks whether to draw in
 * a new figure instead. Returns the host to send from, or null when the person cancelled.
 */
export async function confirmRedraw(
  host: FigureRequestHost,
  request: string,
  copy: boolean
): Promise<FigureRequestHost | 'cancelled' | 'failed'> {
  if (!host.api || !figureHasDrawing(host.api)) {
    return host
  }
  const choice = await askFigureOverwrite(request)
  if (choice === 'cancel') {
    return 'cancelled'
  }
  if (choice === 'redraw') {
    return host
  }
  return (await openRedrawFigure(host, copy)) ?? 'failed'
}
