// `figures refresh`: diagrams take the plots rendered since they embedded them, without rerunning
// their scripts. By diagram (--figure), by plot (--plot: every diagram that shows it), or all.
import path from 'node:path'
import { HarnessError } from './research-harness-error.mjs'
import { listFigures } from './research-figures-folders.mjs'
import { refreshSceneFile } from './research-figures-plot-embed.mjs'

export async function refreshFigures(project, { figure = null, plot = null } = {}) {
  const { figures, folder } = await listFigures(project)
  const scenes = figures.filter((entry) => String(entry.scene ?? '').endsWith('.excalidraw'))
  const chosen = figure ? scenes.filter((entry) => entry.slug === figure) : scenes
  if (figure && !chosen.length) {
    throw new HarnessError('not_found', `No figure ${String(figure)} in ${String(folder)}`)
  }
  const results = []
  for (const entry of chosen) {
    try {
      const changed = await refreshSceneFile(project, path.join(project, entry.scene), plot)
      results.push({ slug: entry.slug, scene: entry.scene, changed })
    } catch (error) {
      results.push({ slug: entry.slug, scene: entry.scene, changed: [], error: error.message })
    }
  }
  return { figures: results }
}

export function refreshText(result) {
  const lines = result.figures
    .filter((entry) => entry.changed.length || entry.error)
    .map((entry) =>
      entry.error
        ? `${entry.scene}: ${entry.error}`
        : `${entry.scene}: new render of ${entry.changed.join(', ')}`
    )
  return lines.length ? lines.join('\n') : 'Every diagram already shows its plots’ latest render.'
}
