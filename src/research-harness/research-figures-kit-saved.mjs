// A figure's saved parts and module templates, split from research-figures-kit.mjs to keep it
// short: savePart writes a reusable part, template draws a module and relabels it.
import path from 'node:path'
import { oneOf } from './research-figures-options.mjs'
import { userLibraryDirectory, writeLibraryPart } from './research-figures-library.mjs'
import { TEMPLATES, relabelTemplate } from './research-figures-templates.mjs'

export function savedPartMethods({
  fig,
  find,
  owned,
  elements,
  target,
  library,
  keep,
  claimed,
  settleBindings
}) {
  /** Saves items (with their labels) as a reusable part: in the project, or `scope: 'user'`. */
  const savePart = async (name, ids, { scope = 'project' } = {}) => {
    oneOf('scope', scope, ['project', 'user'])
    const chosen = new Set(ids.flatMap((id) => owned(id)).map((element) => element.id))
    for (const id of chosen) {
      for (const bound of find(id)?.boundElements ?? []) {
        if (bound.type === 'text') {
          chosen.add(bound.id)
        }
      }
    }
    const parts = structuredClone(elements.filter((element) => chosen.has(element.id)))
    const folder =
      scope === 'user' ? userLibraryDirectory() : path.join(path.dirname(target), 'library')
    const file = await writeLibraryPart(folder, name, parts)
    library.unshift({ name, scope, file, elements: parts })
    return file
  }
  /** A module template (`figures kit templates`): its parts' ids and where data enters and leaves. */
  const template = (name, spec) => {
    const entry = TEMPLATES[name]
    if (!entry) {
      throw new Error(`Unknown template "${name}". Templates: ${Object.keys(TEMPLATES).join(', ')}`)
    }
    if (!spec?.id) {
      throw new Error('template(name, { id, x, y }) needs an id')
    }
    // Why: a rerun with fewer parts must not leave the old ones behind.
    keep(
      (element) =>
        claimed.has(element.customData?.asterKit) ||
        !String(element.customData?.asterKit ?? '').startsWith(`${spec.id}-`)
    )
    settleBindings()
    const drawn = entry[0](fig, spec)
    // Why a promise: a template that places plots reads them from disk (await fig.template).
    return typeof drawn?.then === 'function'
      ? drawn.then((done) => relabelTemplate(fig, { id: spec.id, ...done }, spec.labels))
      : relabelTemplate(fig, { id: spec.id, ...drawn }, spec.labels)
  }
  return { savePart, template }
}
