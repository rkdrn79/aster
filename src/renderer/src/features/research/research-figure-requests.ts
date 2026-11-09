import { CaptureUpdateAction, getCommonBounds, newElementWith } from '@excalidraw/excalidraw'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import {
  PAGE_FRAME_ID,
  elementsTouching,
  shortAreaName
} from '../../../../research-harness/research-figures-model.mjs'
import { areaNeighbours } from '../../../../research-harness/research-figures-lint.mjs'
import type { FigureSwatch } from '../../../../research-harness/research-figures-style.mjs'
import {
  FIGURE_QUICK_ACTIONS,
  buildFigureAreaPrompt,
  buildFigureQuickPrompt,
  buildFigureSelectionPrompt,
  figureContextKey,
  type FigureQuickRequest
} from './research-figures-agent-prompts'
import { sendFiguresPrompt } from './research-figures-agent-session'
import { figureSceneText, writeFigureSketches } from './research-figures-export'
import { confirmRedraw } from './research-figure-overwrite'
import { prepareFigureVariants, useFigureVariantsMode } from './research-figure-variants'
import { figurePromptContext, type FigureRequestHost } from './research-figure-prompt-context'
import { beginFigureTurn, failFigureTurn } from './research-figure-turn'

export { figurePromptContext, type FigureRequestHost } from './research-figure-prompt-context'

export async function saveFirst(host: FigureRequestHost): Promise<string | null> {
  if (host.api && !(await host.save())) {
    return 'The figure could not be saved, so the agent would not see it. Resolve the message above first.'
  }
  return null
}

/** The open figure as the agent is about to see it, kept as its "before send" version. */
export function figureBeforeSend(host: FigureRequestHost): string | null {
  return host.api && host.target ? figureSceneText(host.api) : null
}

/**
 * Sends a Figure prompt as one tracked turn: the figure's version before it goes to History and
 * the canvas shows the agent's progress until the turn ends.
 */
export async function sendTrackedFigurePrompt(
  host: FigureRequestHost,
  input: { request: string; prompt: string; before: string | null }
): Promise<string | null> {
  const id = beginFigureTurn({
    target: host.api ? host.target : null,
    request: input.request,
    prompt: input.prompt,
    scope: host.scope,
    beforeText: input.before
  })
  const failure = await sendFiguresPrompt(
    host.scope,
    input.prompt,
    figureContextKey(figurePromptContext(host))
  )
  if (failure) {
    failFigureTurn(id, failure)
  }
  return failure
}

const REDRAWS: ReadonlySet<FigureQuickRequest> = new Set(['draw-method', 'sketch'])

export async function sendFigureQuickRequest(
  start: FigureRequestHost,
  request: FigureQuickRequest
): Promise<string | null> {
  if (request !== 'draw-method' && request !== 'plot' && !start.api) {
    return 'Open a figure first.'
  }
  const label = FIGURE_QUICK_ACTIONS.find((entry) => entry.request === request)?.label ?? request
  // Why no question with variants: they go to .variants/, so the figure itself stays as it is.
  const variants =
    useFigureVariantsMode.getState().on && request !== 'plot' && start.target !== null
  const confirmed =
    REDRAWS.has(request) && !variants
      ? await confirmRedraw(start, label, request === 'sketch')
      : start
  if (confirmed === 'cancelled') {
    return null
  }
  if (confirmed === 'failed') {
    return 'The new figure did not open. Open it from the list and try again.'
  }
  const host = confirmed
  const failure = await saveFirst(host)
  if (failure) {
    return failure
  }
  const before = figureBeforeSend(host)
  if (variants && host.target) {
    await prepareFigureVariants(host.target)
  }
  const images =
    request === 'sketch' && host.api
      ? host.api
          .getSceneElements()
          .filter((element) => element.type === 'image')
          .map((element) => element.id)
      : []
  const sketches =
    images.length && host.api && host.target
      ? await writeFigureSketches(host.api, host.target, images)
      : []
  return sendTrackedFigurePrompt(host, {
    request: variants ? `${label} (three variants)` : label,
    prompt: buildFigureQuickPrompt(figurePromptContext(host), request, sketches, variants),
    before
  })
}

/** Names the area after the request, saves it, and sends the agent its bounds and neighbors. */
export async function sendFigureAreaRequest(
  host: FigureRequestHost,
  frameId: string,
  prompt: string
): Promise<string | null> {
  const { api, target } = host
  const frame = api?.getSceneElements().find((element) => element.id === frameId)
  if (!api || !target || frame?.type !== 'frame') {
    return 'The area is gone. Draw it again.'
  }
  const before = figureBeforeSend(host)
  api.updateScene({
    elements: api.getSceneElementsIncludingDeleted().map((element) =>
      element.id === frameId && element.type === 'frame'
        ? newElementWith(element, {
            name: shortAreaName(prompt),
            customData: {
              ...element.customData,
              asterArea: { prompt, requestedAt: new Date().toISOString() }
            }
          })
        : element
    ),
    captureUpdate: CaptureUpdateAction.IMMEDIATELY
  })
  const failure = await saveFirst(host)
  if (failure) {
    return failure
  }
  const elements = api.getSceneElements()
  const touching = elementsTouching(elements, frame)
  const sketches = await writeFigureSketches(
    api,
    target,
    touching.filter((entry) => entry.type === 'image').map((entry) => entry.id)
  )
  return sendTrackedFigurePrompt(host, {
    request: `Generate in area: ${prompt}`,
    before,
    prompt: buildFigureAreaPrompt(figurePromptContext(host), {
      prompt,
      area: {
        id: frame.id,
        name: shortAreaName(prompt),
        x: frame.x,
        y: frame.y,
        width: frame.width,
        height: frame.height
      },
      touching,
      neighbours: areaNeighbours(elements, frame),
      sketches
    })
  })
}

/** The selected elements, without the page frame. */
export function selectedFigureElements(api: ExcalidrawImperativeAPI) {
  const selected = api.getAppState().selectedElementIds
  return api
    .getSceneElements()
    .filter((element) => selected[element.id] && element.id !== PAGE_FRAME_ID)
}

/** Paints the selection with a style colour: shapes take fill and outline, text and lines ink. */
export function applyFigureSwatch(api: ExcalidrawImperativeAPI, entry: FigureSwatch): void {
  const ids = new Set(selectedFigureElements(api).map((element) => element.id))
  api.updateScene({
    elements: api.getSceneElementsIncludingDeleted().map((element) => {
      if (!ids.has(element.id) || element.type === 'frame') {
        return element
      }
      // Why ink for text and lines: a block's outline may be transparent, its label never.
      return element.type === 'text' || element.type === 'arrow' || element.type === 'line'
        ? newElementWith(element, { strokeColor: entry.ink })
        : newElementWith(element, { strokeColor: entry.stroke, backgroundColor: entry.fill })
    }),
    appState: {
      currentItemStrokeColor: entry.stroke === 'transparent' ? entry.ink : entry.stroke,
      currentItemBackgroundColor: entry.fill
    },
    captureUpdate: CaptureUpdateAction.IMMEDIATELY
  })
}

export async function sendFigureSelectionRequest(
  host: FigureRequestHost,
  prompt: string
): Promise<string | null> {
  const { api } = host
  const selected = api ? selectedFigureElements(api) : []
  if (!api || !selected.length) {
    return 'Select the elements to ask about first.'
  }
  const failure = await saveFirst(host)
  if (failure) {
    return failure
  }
  const before = figureBeforeSend(host)
  const [minX, minY, maxX, maxY] = getCommonBounds(selected)
  const ids = new Set(selected.map((element) => element.id))
  const all = api.getSceneElements()
  return sendTrackedFigurePrompt(host, {
    request: `Ask: ${prompt}`,
    before,
    prompt: buildFigureSelectionPrompt(figurePromptContext(host), {
      prompt,
      selected: elementsTouching(all, {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY
      }).filter((entry) => ids.has(entry.id)),
      bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
    })
  })
}
