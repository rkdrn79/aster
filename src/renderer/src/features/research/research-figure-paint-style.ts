import { newElementWith } from '@excalidraw/excalidraw'
import type { Arrowhead, ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import { FIGURE_UNITS_PER_POINT } from '../../../../research-harness/research-figures-model.mjs'
import { selectionUnits } from './research-figure-geometry-edit'
import { isLine, isShape } from './research-figure-line-style'
import { figureTextTargets, withFigureTextPt } from './research-figure-text-size'

type Marks = { asterRole?: unknown; asterLine?: unknown }

/**
 * A copied style by role, as PowerPoint's Format Painter and Figma's Copy properties work: the
 * box's look, the line's look and the label's type are kept apart, so pasting never gives a label
 * a box's fill or a box a label's colour.
 */
export type FigureStyleCopy = {
  shape: {
    backgroundColor: string
    strokeColor: string
    strokeWidth: number
    strokeStyle: ExcalidrawElement['strokeStyle']
    fillStyle: ExcalidrawElement['fillStyle']
    opacity: number
    marks: Marks
  } | null
  line: {
    strokeColor: string
    strokeWidth: number
    strokeStyle: ExcalidrawElement['strokeStyle']
    opacity: number
    startArrowhead: Arrowhead | null
    endArrowhead: Arrowhead | null
    marks: Marks
  } | null
  text: { fontSize: number; strokeColor: string } | null
}

function marksOf(element: ExcalidrawElement): Marks {
  const data = element.customData ?? {}
  return {
    ...('asterRole' in data ? { asterRole: data.asterRole } : {}),
    ...('asterLine' in data ? { asterLine: data.asterLine } : {})
  }
}

/** The style of the first thing selected: its shape or line, and its label's type. */
export function copyFigureStyle(
  selected: readonly ExcalidrawElement[],
  elements: readonly ExcalidrawElement[]
): FigureStyleCopy | null {
  const [unit] = selectionUnits(selected, elements)
  if (!unit) {
    return null
  }
  const main = unit.primary
  const shape = isShape(main) ? main : null
  const line = isLine(main) ? main : null
  const labels = figureTextTargets(unit.members, elements).toSorted(
    (a, b) => (b.type === 'text' ? b.fontSize : 0) - (a.type === 'text' ? a.fontSize : 0)
  )
  const [label] = labels
  return {
    shape: shape && {
      backgroundColor: shape.backgroundColor,
      strokeColor: shape.strokeColor,
      strokeWidth: shape.strokeWidth,
      strokeStyle: shape.strokeStyle,
      fillStyle: shape.fillStyle,
      opacity: shape.opacity,
      marks: marksOf(shape)
    },
    line:
      line?.type === 'arrow' || line?.type === 'line'
        ? {
            strokeColor: line.strokeColor,
            strokeWidth: line.strokeWidth,
            strokeStyle: line.strokeStyle,
            opacity: line.opacity,
            startArrowhead: line.type === 'arrow' ? line.startArrowhead : null,
            endArrowhead: line.type === 'arrow' ? line.endArrowhead : null,
            marks: marksOf(line)
          }
        : null,
    text:
      label?.type === 'text' ? { fontSize: label.fontSize, strokeColor: label.strokeColor } : null
  }
}

/** What a copied style holds, in a few words for the toast. */
export function describeStyleCopy(copy: FigureStyleCopy): string {
  const parts = [
    copy.shape ? 'box fill and outline' : null,
    copy.line ? 'line and ends' : null,
    copy.text
      ? `label ${Math.round((copy.text.fontSize / FIGURE_UNITS_PER_POINT) * 10) / 10} pt`
      : null
  ].filter(Boolean)
  return parts.join(', ')
}

function withMarks(element: ExcalidrawElement, marks: Marks): Record<string, unknown> {
  const { asterRole: _role, asterLine: _line, ...rest } = element.customData ?? {}
  return { ...rest, ...marks }
}

/**
 * The selection with a copied style pasted by role: boxes take the box look, lines the line look
 * and ends, labels the type size (math and boxes follow, as Text size does) and colour.
 */
export function pasteFigureStyle(
  elements: readonly ExcalidrawElement[],
  selected: readonly ExcalidrawElement[],
  copy: FigureStyleCopy
): ExcalidrawElement[] {
  const ids = new Set(selected.map((element) => element.id))
  const targets = figureTextTargets(selected, elements)
  const sized = copy.text
    ? withFigureTextPt(elements, targets, copy.text.fontSize / FIGURE_UNITS_PER_POINT)
    : [...elements]
  const labels = new Set(targets.map((element) => element.id))
  return sized.map((element) => {
    if (copy.shape && ids.has(element.id) && isShape(element)) {
      const { marks, ...look } = copy.shape
      return newElementWith(element, { ...look, customData: withMarks(element, marks) })
    }
    if (copy.line && ids.has(element.id) && isLine(element)) {
      const { marks, startArrowhead, endArrowhead, ...look } = copy.line
      return newElementWith(element, {
        ...look,
        ...(element.type === 'arrow' ? { startArrowhead, endArrowhead } : {}),
        customData: withMarks(element, marks)
      })
    }
    if (copy.text && labels.has(element.id) && element.type === 'text') {
      return newElementWith(element, { strokeColor: copy.text.strokeColor })
    }
    return element
  })
}
