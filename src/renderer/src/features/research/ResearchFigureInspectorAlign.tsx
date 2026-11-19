import { useState } from 'react'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  type LucideIcon
} from 'lucide-react'
import { FIGURE_UNITS_PER_POINT } from '../../../../research-harness/research-figures-model.mjs'
import {
  alignUnits,
  distributeUnits,
  setUnitsGap,
  uniformGap,
  unitsBox,
  type AlignEdge,
  type DistributeAxis
} from './research-figure-align'
import { selectionUnits } from './research-figure-geometry-edit'
import type { InspectorContext } from './research-figure-inspector-registry'
import { InspectorHeading, InspectorNumber } from './ResearchFigureInspectorParts'

type Target = 'selection' | 'page'

/** Eight icon buttons fit the Inspector's 248 px in one row. */
const ICON_BUTTON =
  'flex h-7 w-[26px] shrink-0 items-center justify-center rounded-lg transition-colors duration-150 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-3.5 [&_svg]:text-muted-foreground'

const EDGES: readonly { edge: AlignEdge; label: string; icon: LucideIcon }[] = [
  { edge: 'left', label: 'Align left edges', icon: AlignStartVertical },
  { edge: 'center', label: 'Align centres (horizontally)', icon: AlignCenterVertical },
  { edge: 'right', label: 'Align right edges', icon: AlignEndVertical },
  { edge: 'top', label: 'Align top edges', icon: AlignStartHorizontal },
  { edge: 'middle', label: 'Align middles (vertically)', icon: AlignCenterHorizontal },
  { edge: 'bottom', label: 'Align bottom edges', icon: AlignEndHorizontal }
]
const SPREAD: readonly { axis: DistributeAxis; label: string; icon: LucideIcon }[] = [
  { axis: 'x', label: 'Equal gaps across', icon: AlignHorizontalDistributeCenter },
  { axis: 'y', label: 'Equal gaps down', icon: AlignVerticalDistributeCenter }
]

/**
 * Align and spacing for the selection, as Figma's and PowerPoint's align rows: edges and centres
 * against the selection or the page, equal gaps, and the gap itself in points.
 */
export function InspectorAlignSection({
  context
}: {
  context: InspectorContext
}): React.JSX.Element {
  const [chosen, setChosen] = useState<Target>('selection')
  const units = selectionUnits(context.selected, context.elements)
  // Why: one item has nothing to line up with but the page (PowerPoint's "Align to Slide").
  const target: Target = units.length < 2 ? 'page' : chosen
  const reference = target === 'page' ? context.page : unitsBox(units)
  const spacing = uniformGap(units)
  const run = (edit: (elements: readonly ExcalidrawElement[]) => ExcalidrawElement[]): void => {
    const elements = context.api()?.getSceneElementsIncludingDeleted()
    if (elements) {
      context.commit(edit(elements))
    }
  }
  return (
    <div>
      <InspectorHeading
        aside={
          <div role="radiogroup" aria-label="Align to" className="flex text-2xs">
            {(['selection', 'page'] as const).map((entry) => (
              <button
                key={entry}
                type="button"
                role="radio"
                aria-checked={target === entry}
                disabled={entry === 'selection' && units.length < 2}
                className="rounded px-1 text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-40 aria-checked:text-foreground aria-checked:underline"
                onClick={() => setChosen(entry)}
              >
                {entry === 'selection' ? 'Selection' : 'Page'}
              </button>
            ))}
          </div>
        }
      >
        Align
      </InspectorHeading>
      <div role="group" aria-label="Align" className="flex items-center px-2">
        {EDGES.map(({ edge, label, icon: Icon }) => (
          <button
            key={edge}
            type="button"
            className={ICON_BUTTON}
            aria-label={`${label} to the ${target}`}
            title={`${label} to the ${target}`}
            disabled={!reference || !units.length}
            onClick={() => {
              if (reference) {
                run((elements) => alignUnits(elements, units, edge, reference))
              }
            }}
          >
            <Icon aria-hidden />
          </button>
        ))}
        <span className="mx-1 h-4 w-px shrink-0 bg-border" aria-hidden />
        {SPREAD.map(({ axis, label, icon: Icon }) => (
          <button
            key={axis}
            type="button"
            className={ICON_BUTTON}
            aria-label={label}
            title={units.length < 3 ? `${label} (select 3 or more)` : label}
            disabled={units.length < 3}
            onClick={() => run((elements) => distributeUnits(elements, units, axis))}
          >
            <Icon aria-hidden />
          </button>
        ))}
      </div>
      {units.length >= 2 ? (
        <div className="grid grid-cols-2 gap-1 px-3 pt-1">
          <InspectorNumber
            label="Gap"
            value={spacing.gap === null ? null : spacing.gap / FIGURE_UNITS_PER_POINT}
            mixed={spacing.gap === null}
            step={1}
            bigStep={8}
            digits={1}
            onCommit={(pt) =>
              run((elements) => setUnitsGap(elements, units, pt * FIGURE_UNITS_PER_POINT))
            }
          />
          <span className="self-center text-2xs text-muted-foreground">
            pt {spacing.axis === 'x' ? 'across' : 'down'}
          </span>
        </div>
      ) : null}
    </div>
  )
}
