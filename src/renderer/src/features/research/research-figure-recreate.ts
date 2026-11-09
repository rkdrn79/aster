import { CaptureUpdateAction, newElementWith } from '@excalidraw/excalidraw'
import {
  FIGURE_UNITS_PER_INCH,
  PAGE_FRAME_ID,
  figurePage,
  figureSizeLabel,
  referenceRegionsPath
} from '../../../../research-harness/research-figures-model.mjs'
import { imageMimeType, imageSize } from '../../../../research-harness/research-figures-image.mjs'
import { buildFigureRecreatePrompt } from './research-figures-agent-prompts'
import { confirmRedraw } from './research-figure-overwrite'
import {
  figureBeforeSend,
  figurePromptContext,
  saveFirst,
  sendTrackedFigurePrompt,
  type FigureRequestHost
} from './research-figure-requests'
import { measureReferenceRegions } from './research-figure-reference-regions'
import {
  bytesToBase64,
  listProjectDirectory,
  projectAbsolutePath,
  writeProjectBinary,
  writeProjectText,
  type ProjectFileOwner
} from './research-project-files'

export type FigureReference = { bytes: Uint8Array; name: string }

/** The page height that gives the page the reference's shape at the page's width. */
export function matchedPageHeight(widthIn: number, pixels: { width: number; height: number }) {
  return Math.round(((widthIn * pixels.height) / pixels.width) * 100) / 100
}

/** Measures the reference's colour regions for `figures reference`; a miss only loses the aid. */
async function writeReferenceRegions(
  owner: ProjectFileOwner,
  relative: string,
  bytes: Uint8Array,
  pixels: { width: number; height: number }
): Promise<void> {
  try {
    const image = new Image()
    image.src = `data:${imageMimeType(relative)};base64,${bytesToBase64(bytes)}`
    await image.decode()
    const regions = measureReferenceRegions(image)
    const text = JSON.stringify({ reference: relative, ...pixels, regions }, null, 1)
    await writeProjectText(owner, referenceRegionsPath(relative), `${text}\n`)
  } catch {
    // Why: the recreation works without the measurements; the agent reads the image itself.
  }
}

/**
 * Saves the reference beside the figure (kept out of Git), marks the figure as its recreation,
 * optionally gives the page the reference's shape, and asks the agent to reproduce it.
 */
export async function sendFigureRecreateRequest(
  start: FigureRequestHost,
  reference: FigureReference,
  matchPage: boolean,
  /** Caps the matched height (a tall reference would make a page taller than a column). */
  maxHeightIn: number | null = null
): Promise<string | null> {
  if (!start.api || !start.target) {
    return 'Open or create the figure to recreate it in first.'
  }
  const pixels = imageSize(reference.bytes)
  if (!pixels) {
    return 'Use a PNG or JPEG image.'
  }
  const confirmed = await confirmRedraw(start, 'Recreate from image', false)
  if (confirmed === 'cancelled') {
    return null
  }
  if (confirmed === 'failed' || !confirmed.api || !confirmed.target) {
    return 'The new figure did not open. Open it from the list and try again.'
  }
  const host = confirmed
  const api = confirmed.api
  const target = confirmed.target
  const owner = confirmed.owner
  const before = figureBeforeSend(host)
  const extension = imageMimeType(reference.name) === 'image/jpeg' ? 'jpg' : 'png'
  const folder = `${target.folder}/references`
  const relative = `${folder}/${target.slug}.${extension}`
  await writeProjectBinary(owner, relative, reference.bytes)
  if (!(await listProjectDirectory(owner, folder))?.some((entry) => entry.name === '.gitignore')) {
    await writeProjectText(owner, `${folder}/.gitignore`, '*\n')
  }
  await writeReferenceRegions(owner, relative, reference.bytes, pixels)
  const page = figurePage(api.getSceneElements())
  if (page) {
    const matched = matchPage ? matchedPageHeight(page.widthIn, pixels) : page.heightIn
    const heightIn = maxHeightIn !== null ? Math.min(matched, maxHeightIn) : matched
    api.updateScene({
      elements: api.getSceneElementsIncludingDeleted().map((element) =>
        element.id === PAGE_FRAME_ID && element.type === 'frame'
          ? newElementWith(element, {
              height: Math.round(heightIn * FIGURE_UNITS_PER_INCH),
              name: `Figure · ${figureSizeLabel(page.widthIn, heightIn)}`,
              customData: {
                ...element.customData,
                asterPage: {
                  ...element.customData?.asterPage,
                  widthIn: page.widthIn,
                  heightIn,
                  reference: relative
                }
              }
            })
          : element
      ),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY
    })
  }
  const failure = await saveFirst(host)
  if (failure) {
    return failure
  }
  return sendTrackedFigurePrompt(host, {
    request: 'Recreate from image',
    before,
    prompt: buildFigureRecreatePrompt(figurePromptContext(host), {
      referencePath: projectAbsolutePath(owner, relative),
      pixels
    })
  })
}
