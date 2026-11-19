// `figures measure "<text>" [--size N] [--box] [--figure SLUG]`: how wide a label prints, from
// the shell and without a scene, so boxes and gaps are sized before anything is drawn. The text
// is measured in the figure's style (its fonts and padding) or the default one.
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { figurePage, newFigureScene } from './research-figures-model.mjs'
import { openFigure } from './research-figures-kit.mjs'

/** The label's ink box, and with `box` the box a kit box needs around it. */
export async function measureLabel(
  project,
  { text, size, box = false, figure = null, sceneFile = null }
) {
  if (!text) {
    throw new Error(
      'figures measure takes the label to measure: figures measure "Encoder" --size 14'
    )
  }
  const page = sceneFile ? figurePage(JSON.parse(await readFile(sceneFile, 'utf8')).elements) : null
  const folder = await mkdtemp(path.join(os.tmpdir(), 'aster-figures-measure-'))
  try {
    const file = path.join(folder, 'measure.excalidraw')
    await writeFile(file, JSON.stringify(newFigureScene({ widthIn: 6.75, heightIn: 2 })))
    const fig = await openFigure(file)
    if (page?.style) {
      fig.style(page.style, page.accent ? { accent: page.accent } : {})
    }
    const math = /^\$.*\$$/s.test(text.trim())
    const textSize = size ?? undefined
    const ink = fig.measure(math ? 'math' : 'text', {
      ...(math ? { tex: text.trim().slice(1, -1) } : { text }),
      ...(textSize ? { size: textSize } : {})
    })
    const around = box
      ? fig.measure('box', { label: text, ...(textSize ? { size: textSize } : {}) })
      : null
    return {
      text,
      size: textSize ?? null,
      figure,
      style: page?.style ?? null,
      width: ink.width,
      height: ink.height,
      ...(around ? { box: { width: around.width, height: around.height } } : {})
    }
  } finally {
    await rm(folder, { recursive: true, force: true })
  }
}

export function measureText(result) {
  const lines = [
    `"${result.text}"${result.size ? ` at ${result.size}` : ''}: ${result.width} × ${result.height} units of ink${result.style ? ` (${result.style})` : ''}`
  ]
  if (result.box) {
    lines.push(
      `a box around it (fig.box with this label): ${result.box.width} × ${result.box.height} units`
    )
  }
  return lines.join('\n')
}
