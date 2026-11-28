// The person's hand edits on disk, for the kit and the CLI: `<figures>/src/<slug>.edits.json`
// (written by Aster when the person saves) and `<record root>/cache/figures/<slug>.kept.json`
// (what the last script run kept and overrode, so figures check and preview can say it later).
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { projectLayout } from './research-layout.mjs'
import { FIGURE_SCENE_EXTENSION, figurePreviewPaths } from './research-figures-model.mjs'
import { applyPersonEdits, parsePersonEdits } from './research-figures-person-edits.mjs'
import { personEditLines, personEditReport } from './research-figures-person-words.mjs'

/** The ledger beside a figure's script, or null for a scene that is not a figure's own file. */
export function personEditsFileFor(sceneFile) {
  const name = path.basename(sceneFile)
  if (!name.endsWith(FIGURE_SCENE_EXTENSION)) {
    return null
  }
  const slug = name.slice(0, -FIGURE_SCENE_EXTENSION.length)
  return { slug, file: path.join(path.dirname(sceneFile), 'src', `${slug}.edits.json`) }
}

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch {
    return null
  }
}

/** The ledger, or null when the person has edited nothing by hand. */
export async function readPersonEditsFile(file) {
  const value = await readJson(file)
  const ledger = value ? parsePersonEdits(value) : null
  return ledger?.edits.length ? ledger : null
}

export async function writePersonEditsFile(file, ledger) {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, `${JSON.stringify(parsePersonEdits(ledger), null, 2)}\n`)
}

function keptFile(project, slug) {
  return path.join(project, figurePreviewPaths(projectLayout(project).root, slug).kept)
}

/**
 * The kit's save: puts the person's edits back on the scene before it is written, records what it
 * kept and overrode for figures check, and prints that for the agent. Null when there are none.
 */
export async function keepPersonEditsOnSave({ project, target, scene }) {
  const owner = personEditsFileFor(target)
  const ledger = owner ? await readPersonEditsFile(owner.file) : null
  if (!owner || !ledger) {
    return null
  }
  const { report } = applyPersonEdits(scene, ledger)
  const words = personEditReport(ledger, report)
  const cache = path.dirname(keptFile(project, owner.slug))
  await mkdir(cache, { recursive: true }).catch(() => {})
  await writeFile(path.join(cache, '.gitignore'), '*\n', { flag: 'wx' }).catch(() => {})
  await writeFile(
    keptFile(project, owner.slug),
    `${JSON.stringify({ at: new Date().toISOString(), overrode: report.overrode, gone: report.gone }, null, 2)}\n`
  ).catch(() => {})
  for (const line of personEditLines(words, owner.slug)) {
    console.warn(line)
  }
  return { kept: words.count, overrode: report.overrode.length, gone: report.gone.length }
}

/**
 * What figures check, preview and show tell the agent: the person's edits as they stand in the
 * current scene (gone when their element is missing) and what the last run overrode.
 */
export async function personEditStatus(project, figure, scene) {
  const owner = personEditsFileFor(path.join(project, figure.scene))
  const ledger = owner ? await readPersonEditsFile(owner.file) : null
  if (!ledger) {
    return null
  }
  const present = new Set(
    (scene?.elements ?? []).filter((element) => !element?.isDeleted).map((element) => element.id)
  )
  const gone = ledger.edits
    .filter((entry) => !entry.added && !entry.removed && !present.has(entry.id))
    .map((entry) => ({ id: entry.id, label: entry.label ?? entry.id }))
  const kept = await readJson(keptFile(project, figure.slug))
  const overrode = Array.isArray(kept?.overrode) ? kept.overrode : []
  const report = personEditReport(ledger, { gone, overrode })
  return {
    ...report,
    edited: Object.fromEntries(
      ledger.edits.map((entry) => [
        entry.id,
        entry.added ? ['added'] : entry.removed ? ['removed'] : Object.keys(entry.set ?? {})
      ])
    ),
    lines: personEditLines(report, figure.slug)
  }
}
