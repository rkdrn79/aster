// `figures preview`: waits for Aster's PNG of the current scene. Aster on the person's computer
// renders it in the background whenever it runs and is connected to the project (the Figures page
// need not be open), stamps `cache/figures/.aster-renderer.json` while it does, and answers the
// request file this writes first. Without a recent stamp the wait is short and says so plainly.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { HarnessError } from './research-harness-error.mjs'
import { projectLayout } from './research-layout.mjs'
import { imageSize } from './research-figures-image.mjs'
import { pngIsBlank } from './research-figures-png.mjs'
import { sha256 } from './research-figures-folders.mjs'
import {
  checkFigureScene,
  figurePage,
  figurePreviewPaths,
  figureRendererPath
} from './research-figures-model.mjs'
import { personEditStatus } from './research-figures-person-files.mjs'

/** How long `figures preview` waits by default: Aster renders in seconds, a minute when busy. */
export const PREVIEW_WAIT_SECONDS = 90
/** Aster stamps every 30 s; an older stamp means it is not rendering this project now. */
export const RENDERER_FRESH_MS = 75_000
// Why still wait without a stamp: Aster may be connecting, or older and rendering open figures.
export const UNCONNECTED_WAIT_SECONDS = 20

async function readJson(target) {
  try {
    return JSON.parse(await readFile(target, 'utf8'))
  } catch {
    return null
  }
}

/** Whether Aster renders this project's previews now, from its stamp. */
export async function figureRendererState(project, now = Date.now()) {
  const stamp = await readJson(path.join(project, figureRendererPath(projectLayout(project).root)))
  const at = Date.parse(stamp?.at ?? '')
  return {
    seenAt: Number.isFinite(at) ? at : null,
    fresh: Number.isFinite(at) && now - at < RENDERER_FRESH_MS
  }
}

function agoText(ms) {
  const minutes = Math.round(ms / 60_000)
  if (minutes < 2) {
    return 'a minute ago'
  }
  if (minutes < 120) {
    return `${minutes} minutes ago`
  }
  const hours = Math.round(minutes / 60)
  return hours < 48 ? `${hours} hours ago` : `${Math.round(hours / 24)} days ago`
}

/** The miss when Aster is not running or not connected to this project's host. */
export function notConnectedMessage(slug, renderer, now = Date.now()) {
  const last = renderer.seenAt ? ` (it last rendered here ${agoText(now - renderer.seenAt)})` : ''
  return `No preview of ${slug}: Aster on the person's computer renders previews, and it is not connected to this project right now${last}. The figure file is saved. Keep working from figures check and figures show, and say in your reply that the preview appears once Aster is running on their computer and connected to this project; the figure does not have to be open, so do not ask them to open it.`
}

/**
 * Why no Reload or "open it" advice: with Aster connected, a missed preview means it is still
 * busy rendering, so the agent waits longer before telling the person anything.
 */
function previewTimeout(slug, sidecar, waitSeconds) {
  const longer = Math.max(180, Math.round(waitSeconds * 2))
  const again = `run figures preview --figure ${slug} --wait ${longer}`
  const shown = sidecar
    ? `The preview of ${slug} from ${sidecar.renderedAt} shows an older version of the file`
    : `There is no preview of ${slug} yet`
  return `${shown}, and Aster has not finished rendering the current one after ${waitSeconds} s. It is most likely still rendering (it takes longer while Aster is busy): ${again}. If that times out too, keep working from figures check and say in your reply that the preview did not arrive.`
}

// Why 216: the renderer draws the PDF at 216 dpi (FIGURE_PREVIEW_DPI), 1.5 px per scene unit.
const PREVIEW_PX_PER_UNIT = 216 / 144

/**
 * What is wrong with a preview that arrived: a blank page, or a PNG far smaller than the page
 * (an export that dropped the drawing, such as a scene with NaN coordinates).
 */
async function previewProblem(png, page) {
  const bytes = await readFile(png).catch(() => null)
  if (!bytes) {
    return null
  }
  const size = imageSize(bytes)
  const expected = page
    ? {
        width: Math.round(page.width * PREVIEW_PX_PER_UNIT),
        height: Math.round(page.height * PREVIEW_PX_PER_UNIT)
      }
    : null
  const blank = pngIsBlank(bytes)
  const small =
    size && expected && size.width * size.height < expected.width * expected.height * 0.25
  if (!blank && !small) {
    return null
  }
  const details = [
    size ? `${size.width} × ${size.height} px` : null,
    expected ? `the page is about ${expected.width} × ${expected.height}` : null
  ].filter(Boolean)
  return `The preview PNG is ${blank ? 'blank' : 'far smaller than the page'} (${details.join('; ')}): Aster could not draw the scene, so do not judge the figure from it. Run figures check and figures show (look for an element with NaN or a huge size), fix the script, run it, and preview again.`
}

/** Asks Aster for this version first, so it renders it before older ones it has queued. */
async function requestRender(project, files, sceneSha256) {
  const directory = path.join(project, files.directory)
  try {
    await mkdir(directory, { recursive: true })
    await writeFile(path.join(directory, '.gitignore'), '*\n', { flag: 'wx' }).catch(() => {})
    await writeFile(
      path.join(project, files.request),
      `${JSON.stringify({ sceneSha256, at: new Date().toISOString() })}\n`
    )
  } catch {
    // Why quiet: the request only orders Aster's queue; the scene change is seen without it.
  }
}

/** Waits until Aster has rendered the current scene, then returns the PNG preview's path. */
export async function previewFigure(
  project,
  figure,
  { waitSeconds = PREVIEW_WAIT_SECONDS, pollMs = 500 } = {}
) {
  const files = figurePreviewPaths(projectLayout(project).root, figure.slug)
  const started = Date.now()
  const deadline = started + waitSeconds * 1000
  let renderer = await figureRendererState(project)
  let checkedAt = started
  let requested = null
  let sidecar = null
  for (;;) {
    const text = await readFile(path.join(project, figure.scene))
    const hash = sha256(text)
    sidecar = await readJson(path.join(project, files.sidecar))
    let scene = null
    try {
      scene = JSON.parse(text.toString('utf8'))
    } catch {
      scene = null
    }
    if (sidecar?.sceneSha256 === hash) {
      const inProject = (relative) =>
        typeof relative === 'string' ? path.join(project, relative) : null
      const png = path.join(project, files.png)
      const edits = await personEditStatus(project, figure, scene)
      return {
        figure: figure.slug,
        png,
        ...sidecar,
        sceneSha256: hash,
        compare: inProject(sidecar.compare),
        overlay: inProject(sidecar.overlay),
        print: inProject(sidecar.print),
        lint: inProject(sidecar.lint),
        problem: await previewProblem(png, figurePage(scene?.elements ?? [])),
        personEdits: edits?.lines ?? []
      }
    }
    if (requested !== hash) {
      requested = hash
      await requestRender(project, files, hash)
    }
    if (Date.now() - checkedAt >= 5000) {
      checkedAt = Date.now()
      renderer = await figureRendererState(project)
    }
    const limit = renderer.fresh
      ? deadline
      : Math.min(deadline, started + UNCONNECTED_WAIT_SECONDS * 1000)
    if (Date.now() >= limit) {
      const issues = scene ? checkFigureScene(scene) : ['not valid JSON']
      if (issues.length) {
        throw new HarnessError(
          'preview_timeout',
          `${figure.scene} does not open, so Aster cannot render it: ${issues[0]}. Run figures check.`
        )
      }
      throw renderer.fresh
        ? new HarnessError('preview_timeout', previewTimeout(figure.slug, sidecar, waitSeconds))
        : new HarnessError('preview_unavailable', notConnectedMessage(figure.slug, renderer))
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs))
  }
}
