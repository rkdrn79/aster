import { newElementWith } from '@excalidraw/excalidraw'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { BinaryFileData, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import type { FigureStyle } from '../../../../research-harness/research-figures-style.mjs'
import {
  illustrationRecord,
  repaintedIllustration,
  svgOfDataURL,
  type IllustrationRecord
} from './research-figure-illustration'

type Commit = (next: readonly ExcalidrawElement[]) => void

/**
 * Repaints the illustration images `ids` with a changed record (a look, a role) as one undo
 * step: each gets a new SVG file and its record.
 */
export async function restyleIllustrations(
  api: ExcalidrawImperativeAPI,
  ids: ReadonlySet<string>,
  change: (record: IllustrationRecord) => IllustrationRecord,
  style: FigureStyle,
  commit: Commit,
  /** The look the page records for every illustration, when the change is the look. */
  pageLook?: string
): Promise<number> {
  const files = api.getFiles()
  const updates = new Map<string, { record: IllustrationRecord; file: BinaryFileData | null }>()
  for (const element of api.getSceneElements()) {
    const record = illustrationRecord(element)
    if (!record || !ids.has(element.id) || element.type !== 'image' || !element.fileId) {
      continue
    }
    const svg = files[element.fileId] ? svgOfDataURL(files[element.fileId].dataURL) : null
    const next = change(record)
    updates.set(element.id, {
      record: next,
      file: svg ? await repaintedIllustration(svg, next, style) : null
    })
  }
  const added = [...updates.values()].flatMap((update) => (update.file ? [update.file] : []))
  if (added.length) {
    api.addFiles(added)
  }
  commit(
    api.getSceneElementsIncludingDeleted().map((element) => {
      const page: unknown = element.customData?.asterPage
      if (pageLook && page && typeof page === 'object') {
        const kept: unknown = Reflect.get(page, 'illustration')
        return newElementWith(element, {
          customData: {
            ...element.customData,
            asterPage: {
              ...page,
              illustration: { ...(kept && typeof kept === 'object' ? kept : {}), look: pageLook }
            }
          }
        })
      }
      const update = updates.get(element.id)
      if (!update || element.type !== 'image') {
        return element
      }
      const current: unknown = element.customData?.asterIllustration
      return newElementWith(element, {
        ...(update.file ? { fileId: update.file.id } : {}),
        customData: {
          ...element.customData,
          asterIllustration: {
            ...(current && typeof current === 'object' ? current : {}),
            look: update.record.look,
            roles: update.record.roles
          }
        }
      })
    })
  )
  return updates.size
}
