import { newElementWith } from '@excalidraw/excalidraw'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { LossStyle } from '../../../../research-harness/research-figures-palette.mjs'
import {
  hasRedLoss,
  lossColors,
  type FigureStyle
} from '../../../../research-harness/research-figures-style.mjs'
import {
  readAsterRole,
  type AsterArrowRole,
  type AsterShapeRole,
  type AsterTextRole
} from './research-figure-element-meta'

type Paint = {
  fill: string
  stroke: string
  strokeWidth?: number
  dashed?: boolean
}
export type RoleChoice<R extends string> = { role: R; label: string; paint: Paint }
export type ElementKind = 'shape' | 'arrow' | 'text'

const SHAPES = new Set(['rectangle', 'ellipse', 'diamond'])

export function kindOf(element: ExcalidrawElement): ElementKind | null {
  if (SHAPES.has(element.type)) {
    return 'shape'
  }
  if (element.type === 'arrow' || element.type === 'line') {
    return 'arrow'
  }
  return element.type === 'text' ? 'text' : null
}

/**
 * The loss a new Loss role takes: ink, as most papers write it, unless the figure already draws
 * its loss red (then red, so the two match; ink again when the accent sits too near red).
 */
export function figureLoss(
  style: FigureStyle,
  elements: Parameters<typeof hasRedLoss>[0]
): LossStyle {
  return lossColors(style, hasRedLoss(elements) ? 'red' : 'ink')
}

/** The paper's box roles in this figure's style: what each looks like. */
export function shapeRoles(
  style: FigureStyle,
  loss: LossStyle = lossColors(style)
): RoleChoice<AsterShapeRole>[] {
  const outline = style.boxStroke
  return [
    { role: 'block', label: 'Block', paint: { fill: style.block, stroke: outline } },
    {
      role: 'emphasis',
      label: 'Emphasis',
      paint: {
        fill: style.accentColor.fill,
        stroke: outline === 'transparent' ? 'transparent' : style.accentColor.stroke
      }
    },
    { role: 'frozen', label: 'Frozen', paint: { fill: style.strong, stroke: outline } },
    {
      role: 'loss',
      label: 'Loss',
      paint: { fill: loss.fill, stroke: loss.stroke, strokeWidth: 1.5 }
    },
    { role: 'panel', label: 'Panel', paint: { fill: style.panel, stroke: 'transparent' } },
    {
      role: 'note',
      label: 'Note',
      paint: { fill: 'transparent', stroke: style.muted, strokeWidth: 1.5, dashed: true }
    }
  ]
}

export function arrowRoles(
  style: FigureStyle,
  loss: LossStyle = lossColors(style)
): RoleChoice<AsterArrowRole>[] {
  return [
    {
      role: 'data',
      label: 'Data',
      paint: { fill: style.line, stroke: style.line, strokeWidth: 2 }
    },
    {
      role: 'main',
      label: 'Main',
      paint: { fill: style.ink, stroke: style.ink, strokeWidth: 2.5 }
    },
    {
      role: 'side',
      label: 'Side',
      paint: { fill: style.muted, stroke: style.muted, strokeWidth: 1.5 }
    },
    {
      role: 'aux',
      label: 'Aux',
      paint: { fill: style.muted, stroke: style.muted, strokeWidth: 1.5, dashed: true }
    },
    {
      role: 'loss-link',
      label: 'Loss',
      paint: { fill: loss.link, stroke: loss.link, strokeWidth: 1.5, dashed: true }
    }
  ]
}

export function textRoles(style: FigureStyle): (RoleChoice<AsterTextRole> & { size: number })[] {
  return [
    {
      role: 'label',
      label: 'Label 8 pt',
      size: style.textSize,
      paint: { fill: 'transparent', stroke: style.ink }
    },
    {
      role: 'small',
      label: 'Small 7 pt',
      size: style.smallSize,
      paint: { fill: 'transparent', stroke: style.ink }
    }
  ]
}

/** An element's role: its mark, else what the kit's own marks mean. */
export function roleOf(element: ExcalidrawElement, style: FigureStyle): string | null {
  const role = readAsterRole(element)
  const kind = kindOf(element)
  if (kind === 'arrow') {
    const line = element.customData?.asterLine
    // Why: the kit marks loss links `asterRole: 'loss'` and other lines `asterLine`.
    return role === 'loss' ? 'loss-link' : (role ?? (typeof line === 'string' ? line : 'data'))
  }
  if (kind === 'text' && !role && element.type === 'text') {
    return element.fontSize === style.textSize
      ? 'label'
      : element.fontSize === style.smallSize
        ? 'small'
        : null
  }
  return role
}

/** The elements with a role painted on: colours, line weight and dash, and the mark. */
export function paintRole(
  elements: readonly ExcalidrawElement[],
  ids: ReadonlySet<string>,
  kind: ElementKind,
  role: string,
  style: FigureStyle,
  loss: LossStyle = lossColors(style)
): ExcalidrawElement[] {
  const choices: { role: string; paint: Paint }[] =
    kind === 'arrow'
      ? arrowRoles(style, loss)
      : kind === 'text'
        ? textRoles(style)
        : shapeRoles(style, loss)
  const choice = choices.find((entry) => entry.role === role)
  const text = textRoles(style).find((entry) => entry.role === role)
  return elements.map((element) => {
    if (!ids.has(element.id) || kindOf(element) !== kind || !choice) {
      return element
    }
    const customData = { ...element.customData, asterRole: role }
    if (element.type === 'text' && text) {
      const ratio = text.size / element.fontSize
      return newElementWith(element, {
        fontSize: text.size,
        width: element.width * ratio,
        height: element.height * ratio,
        customData
      })
    }
    const { paint } = choice
    return newElementWith(element, {
      strokeColor: paint.stroke,
      ...(kind === 'shape' ? { backgroundColor: paint.fill } : {}),
      ...(paint.strokeWidth ? { strokeWidth: paint.strokeWidth } : {}),
      strokeStyle: paint.dashed ? 'dashed' : 'solid',
      customData
    })
  })
}
