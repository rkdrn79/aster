import { restore, restoreElements } from '@excalidraw/excalidraw'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { BinaryFileData } from '@excalidraw/excalidraw/types'
import { PAGE_FRAME_ID } from '../../../../research-harness/research-figures-model.mjs'
import {
  FIGURE_PARTS,
  buildFigurePart
} from '../../../../research-harness/research-figures-parts.mjs'
import {
  LOSS_COLOR,
  type FigureStyle
} from '../../../../research-harness/research-figures-style.mjs'
import * as iconModule from '../../../../research-harness/research-figures-icons.mjs'
import { lineIconSvg, svgFileData } from './research-figure-svg-files'

export type InsertCategory = 'blocks' | 'data' | 'icons' | 'templates' | 'mine'
export type InsertItem = {
  key: string
  name: string
  category: InsertCategory
  description: string
  /** For my parts: where it is saved and its file. */
  saved?: {
    scope: 'project' | 'user'
    file: string
    /** The project library folder it came from; absent for the person's own parts. */
    directory?: string
    elements: readonly unknown[]
  }
}
export type BuiltItem = { elements: ExcalidrawElement[]; files: BinaryFileData[] }

const DATA_PARTS = new Set(['tensor', 'dataset', 'memory', 'grid', 'stack', 'photo'])
const ICON_SIZE = 24

export function partItems(): InsertItem[] {
  return FIGURE_PARTS.map((part) => ({
    key: `part:${part.id}`,
    name: part.name.replace(/;.*$/, '').replace(/ \(--.*\)$/, ''),
    category: DATA_PARTS.has(part.id) ? 'data' : 'blocks',
    description: part.name
  }))
}

type IconTable = Record<string, readonly [string, string, string]>

function iconTable(): IconTable {
  const table: unknown = Reflect.get(iconModule, 'FIGURE_ICONS')
  if (typeof table !== 'object' || table === null) {
    return {}
  }
  return Object.fromEntries(
    Object.entries(table).flatMap(([name, entry]: [string, unknown]) =>
      Array.isArray(entry) && entry.every((part) => typeof part === 'string')
        ? [[name, [String(entry[0]), String(entry[1]), String(entry[2])] as const]]
        : []
    )
  )
}

// Why the line set: a colour emoji in a paper figure reads as machine-made (the kit's `line`).
const ICON_SVGS = import.meta.glob<string>(
  '../../../../research-harness/vendor/icons/lucide/*.svg',
  {
    query: '?raw',
    import: 'default'
  }
)

export function iconItems(): InsertItem[] {
  return Object.entries(iconTable()).map(([name, [, , meaning]]) => ({
    key: `icon:${name}`,
    name,
    category: 'icons',
    description: meaning
  }))
}

export async function templateItems(): Promise<InsertItem[]> {
  const list = (await window.api.researchFigures?.listTemplates().catch(() => [])) ?? []
  return list.map((entry) => ({
    key: `template:${entry.name}`,
    name: entry.name,
    category: 'templates',
    description: entry.description
  }))
}

/** Plain kit elements (or library JSON) as Excalidraw elements, measured. */
function restored(elements: readonly unknown[]): ExcalidrawElement[] {
  // Why the JSON round trip: restoreElements is Excalidraw's own sanitizer for scene data.
  return restoreElements(JSON.parse(JSON.stringify(elements)), null, {
    refreshDimensions: true,
    repairBindings: true
  })
}

const HUES: Record<string, (style: FigureStyle) => { fill: string; stroke: string }> = {
  block: (style) => ({ fill: style.block, stroke: style.boxStroke }),
  strong: (style) => ({ fill: style.strong, stroke: style.boxStroke }),
  loss: () => ({ fill: LOSS_COLOR.fill, stroke: LOSS_COLOR.stroke })
}

function buildPart(id: string, style: FigureStyle, unique: string): BuiltItem {
  const part = FIGURE_PARTS.find((entry) => entry.id === id)
  const paint = HUES[part?.hue ?? 'block']?.(style)
  const elements = restored(buildFigurePart(id, { id: unique })).map((element) =>
    paint &&
    (element.type === 'rectangle' || element.type === 'ellipse') &&
    element.backgroundColor !== 'transparent'
      ? {
          ...element,
          backgroundColor: paint.fill,
          strokeColor: paint.stroke === 'transparent' ? element.strokeColor : paint.stroke
        }
      : element
  )
  return { elements, files: [] }
}

async function buildIcon(name: string, style: FigureStyle, unique: string): Promise<BuiltItem> {
  const entry = iconTable()[name]
  const load = entry
    ? ICON_SVGS[`../../../../research-harness/vendor/icons/lucide/${entry[1]}.svg`]
    : undefined
  if (!load) {
    throw new Error(`No icon "${name}".`)
  }
  const file = await svgFileData('aster-icon', lineIconSvg(await load(), style))
  const elements = restored([
    {
      type: 'image',
      id: unique,
      x: 0,
      y: 0,
      width: ICON_SIZE,
      height: ICON_SIZE,
      fileId: file.fileId,
      status: 'saved',
      strokeColor: 'transparent',
      customData: { asterIcon: name }
    }
  ])
  return { elements, files: [file.binary] }
}

const templateCache = new Map<string, Promise<BuiltItem>>()

function buildTemplate(name: string, style: FigureStyle): Promise<BuiltItem> {
  const key = `${name}:${style.name}:${style.accentName}`
  let built = templateCache.get(key)
  if (!built) {
    const build = window.api.researchFigures?.buildTemplate
    built = build
      ? build({ name, style: style.name, accent: style.accentName }).then((text) => {
          // Why JSON.parse's any: restore() is Excalidraw's own sanitizer for scenes from disk.
          const scene = restore(JSON.parse(text), null, null, {
            refreshDimensions: true,
            repairBindings: true
          })
          return {
            elements: scene.elements.filter(
              (element) => element.id !== PAGE_FRAME_ID && element.type !== 'frame'
            ),
            files: Object.values(scene.files)
          }
        })
      : Promise.reject(new Error('Update Aster to insert templates.'))
    built.catch(() => templateCache.delete(key))
    templateCache.set(key, built)
  }
  return built
}

/** An item's elements in the figure's style, with ids no other insert of it shares. */
export async function buildInsertItem(item: InsertItem, style: FigureStyle): Promise<BuiltItem> {
  const unique = `${item.key.split(':')[1]}-${Math.random().toString(36).slice(2, 7)}`
  const [kind, name] = item.key.split(':')
  if (kind === 'part') {
    return buildPart(name, style, unique)
  }
  if (kind === 'icon') {
    return buildIcon(name, style, unique)
  }
  if (kind === 'template') {
    return buildTemplate(name, style)
  }
  return { elements: restored(item.saved?.elements ?? []), files: [] }
}
