import { convertToExcalidrawElements, newElementWith } from '@excalidraw/excalidraw'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import type { FigureStyle } from '../../../../research-harness/research-figures-style.mjs'
import flameSvg from '../../../../research-harness/vendor/icons/lucide/flame.svg?raw'
import lockSvg from '../../../../research-harness/vendor/icons/lucide/lock.svg?raw'
import snowflakeSvg from '../../../../research-harness/vendor/icons/lucide/snowflake.svg?raw'
import { lineIconSvg, svgFileData, type SvgFile } from './research-figure-svg-files'

/**
 * Badges are the kit's line icons (`variant: 'line'`), never emoji: a colour emoji in a paper
 * figure reads as machine-made. Their SVG is inked in the figure's style, as the kit does.
 */
export const BADGES = [
  { kind: 'trainable', icon: 'fire', label: 'Trained', svg: flameSvg },
  { kind: 'frozen', icon: 'snowflake', label: 'Frozen', svg: snowflakeSvg },
  { kind: 'locked', icon: 'lock', label: 'Fixed', svg: lockSvg }
] as const
export type BadgeKind = (typeof BADGES)[number]['kind']

/** The kit's badge: 18 units, centred 2 units in from the owner's top-right corner. */
const SIZE = 18
const INSET = 2

export function badgeOf(elements: readonly ExcalidrawElement[], ownerId: string): BadgeKind | null {
  const ids = new Map(elements.filter((e) => !e.isDeleted).map((element) => [element.id, element]))
  return BADGES.find((badge) => ids.has(`${ownerId}-${badge.kind}`))?.kind ?? null
}

/** The icon files the badges use, as the kit names them (`aster-icon-<hash>`). */
export async function badgeFiles(style: FigureStyle): Promise<Map<BadgeKind, SvgFile>> {
  const entries = await Promise.all(
    BADGES.map(
      async (badge) =>
        [badge.kind, await svgFileData('aster-icon', lineIconSvg(badge.svg, style))] as const
    )
  )
  return new Map(entries)
}

/**
 * The scene with each owner's badge set to `kind` (null removes it). Badges are attached to the
 * owner's top-right corner, so they follow it like the kit's.
 */
export function withBadges(
  elements: readonly ExcalidrawElement[],
  owners: readonly ExcalidrawElement[],
  kind: BadgeKind | null,
  files: ReadonlyMap<BadgeKind, SvgFile>
): ExcalidrawElement[] {
  const byId = new Map(elements.map((element) => [element.id, element]))
  const drop = new Set(
    owners.flatMap((owner) =>
      BADGES.filter((badge) => badge.kind !== kind).map((badge) => `${owner.id}-${badge.kind}`)
    )
  )
  const next = elements.map((element) =>
    drop.has(element.id) && !element.isDeleted
      ? newElementWith(element, { isDeleted: true })
      : element
  )
  const badge = BADGES.find((entry) => entry.kind === kind)
  const file = kind ? files.get(kind) : undefined
  if (!badge || !file) {
    return next
  }
  const added: ExcalidrawElement[] = []
  for (const owner of owners) {
    const id = `${owner.id}-${badge.kind}`
    const place = {
      x: owner.x + owner.width - INSET - SIZE / 2,
      y: owner.y + INSET - SIZE / 2,
      width: SIZE,
      height: SIZE
    }
    const customData = {
      asterIcon: badge.icon,
      asterAttach: { to: owner.id, anchor: 'top-right', dx: -INSET, dy: INSET }
    }
    const existing = byId.get(id)
    if (existing?.type === 'image') {
      const index = next.findIndex((element) => element.id === id)
      next[index] = newElementWith(existing, {
        ...place,
        isDeleted: false,
        fileId: file.fileId,
        customData
      })
      continue
    }
    if (existing) {
      continue
    }
    const [image] = convertToExcalidrawElements(
      [
        {
          type: 'image',
          id,
          ...place,
          fileId: file.fileId,
          status: 'saved',
          strokeColor: 'transparent',
          frameId: owner.frameId,
          customData
        }
      ],
      { regenerateIds: false }
    )
    added.push(image)
  }
  return [...next, ...added]
}

export function addBadgeFiles(
  api: ExcalidrawImperativeAPI,
  files: ReadonlyMap<BadgeKind, SvgFile>
) {
  api.addFiles([...files.values()].map((file) => file.binary))
}
