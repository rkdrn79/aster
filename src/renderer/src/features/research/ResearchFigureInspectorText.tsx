import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import {
  AArrowDown,
  AArrowUp,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  TextAlignCenter,
  TextAlignEnd,
  TextAlignStart,
  type LucideIcon
} from 'lucide-react'
import type { InspectorContext } from './research-figure-inspector-registry'
import {
  boxedLabels,
  labelAlignment,
  withLabelAlign,
  type LabelHAlign,
  type LabelVAlign
} from './research-figure-label-align'
import {
  FIGURE_TEXT_STEP_PT,
  figureTextPt,
  figureTextTargets,
  withFigureTextPt,
  withFigureTextStep
} from './research-figure-text-size'
import {
  InspectorAction,
  InspectorHeading,
  InspectorIconButton,
  InspectorNumber
} from './ResearchFigureInspectorParts'

/** Whether the selection holds any label the Text size section can reach. */
export function hasFigureText(context: InspectorContext): boolean {
  return figureTextTargets(context.selected, context.elements).length > 0
}

export const LABEL_H_ALIGNS: readonly { align: LabelHAlign; label: string; icon: LucideIcon }[] = [
  { align: 'left', label: 'Label to the left of its box', icon: TextAlignStart },
  { align: 'center', label: 'Label centred in its box', icon: TextAlignCenter },
  { align: 'right', label: 'Label to the right of its box', icon: TextAlignEnd }
]
export const LABEL_V_ALIGNS: readonly { align: LabelVAlign; label: string; icon: LucideIcon }[] = [
  { align: 'top', label: 'Label at the top of its box', icon: AlignVerticalJustifyStart },
  { align: 'middle', label: 'Label in the middle of its box', icon: AlignVerticalJustifyCenter },
  { align: 'bottom', label: 'Label at the bottom of its box', icon: AlignVerticalJustifyEnd }
]

type Edit = (elements: readonly ExcalidrawElement[]) => ExcalidrawElement[]

/** Size and in-box alignment edits for the labels a selection reaches, read from the live scene. */
export function labelEdits(selected: readonly ExcalidrawElement[]): {
  size: (pt: number) => Edit
  step: (deltaPt: number) => Edit
  align: (align: { h?: LabelHAlign; v?: LabelVAlign }) => Edit
} {
  return {
    size: (pt) => (elements) =>
      withFigureTextPt(elements, figureTextTargets(selected, elements), pt),
    step: (delta) => (elements) =>
      withFigureTextStep(elements, figureTextTargets(selected, elements), delta),
    align: (align) => (elements) => withLabelAlign(elements, boxedLabels(selected, elements), align)
  }
}

/**
 * Text size in points for every label in the selection (PowerPoint's size box, Figma's "Mixed"):
 * bound labels of selected boxes, every line of a grouped label and its math, titles and arrow
 * labels. Boxes grow to hold bigger labels. Labels inside boxes also align in them.
 */
export function InspectorTextSection({
  context
}: {
  context: InspectorContext
}): React.JSX.Element {
  const targets = figureTextTargets(context.selected, context.elements)
  const boxed = boxedLabels(context.selected, context.elements)
  const current = labelAlignment(boxed)
  const pt = figureTextPt(targets)
  const edits = labelEdits(context.selected)
  const apply = (edit: Edit): void => {
    const elements = context.api()?.getSceneElementsIncludingDeleted()
    if (elements) {
      context.commit(edit(elements))
    }
  }
  const count = targets.length
  return (
    <div>
      <InspectorHeading
        aside={
          <span className="text-2xs text-muted-foreground tabular-nums">
            {count} label{count === 1 ? '' : 's'}
          </span>
        }
      >
        Text size
      </InspectorHeading>
      <div className="flex items-center gap-1 px-3">
        <div className="min-w-0 flex-1">
          <InspectorNumber
            label="pt"
            value={pt}
            mixed={pt === null}
            step={FIGURE_TEXT_STEP_PT}
            bigStep={1}
            digits={1}
            onCommit={(value) => apply(edits.size(value))}
          />
        </div>
        <InspectorAction
          label={`Smaller by ${FIGURE_TEXT_STEP_PT} pt (⌘⇧<)`}
          onClick={() => apply(edits.step(-FIGURE_TEXT_STEP_PT))}
        >
          <AArrowDown aria-hidden />
        </InspectorAction>
        <InspectorAction
          label={`Bigger by ${FIGURE_TEXT_STEP_PT} pt (⌘⇧>)`}
          onClick={() => apply(edits.step(FIGURE_TEXT_STEP_PT))}
        >
          <AArrowUp aria-hidden />
        </InspectorAction>
      </div>
      {boxed.length ? (
        <div role="group" aria-label="Label in its box" className="flex items-center px-2 pt-1">
          <span className="w-12 shrink-0 pl-1 text-2xs text-muted-foreground">In box</span>
          {LABEL_H_ALIGNS.map(({ align, label, icon: Icon }) => (
            <InspectorIconButton
              key={align}
              label={label}
              pressed={current.h === align}
              onClick={() => apply(edits.align({ h: align }))}
            >
              <Icon aria-hidden />
            </InspectorIconButton>
          ))}
          <span className="mx-1 h-4 w-px shrink-0 bg-border" aria-hidden />
          {LABEL_V_ALIGNS.map(({ align, label, icon: Icon }) => (
            <InspectorIconButton
              key={align}
              label={label}
              pressed={current.v === align}
              onClick={() => apply(edits.align({ v: align }))}
            >
              <Icon aria-hidden />
            </InspectorIconButton>
          ))}
        </div>
      ) : null}
    </div>
  )
}
