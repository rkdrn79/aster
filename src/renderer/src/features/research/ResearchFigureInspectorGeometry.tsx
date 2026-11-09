import { useState } from 'react'
import { AlignHorizontalSpaceBetween, MoveHorizontal, MoveVertical } from 'lucide-react'
import {
  FIGURE_UNITS_PER_INCH,
  FIGURE_UNITS_PER_POINT
} from '../../../../research-harness/research-figures-model.mjs'
import {
  matchSize,
  selectionUnits,
  setUnitBox,
  spaceEvenly,
  translate
} from './research-figure-geometry-edit'
import type { InspectorContext } from './research-figure-inspector-registry'
import { InspectorAction, InspectorHeading, InspectorNumber } from './ResearchFigureInspectorParts'

type Unit = 'pt' | 'in'
const SCALE: Record<Unit, number> = { pt: FIGURE_UNITS_PER_POINT, in: FIGURE_UNITS_PER_INCH }
/** The gap Space evenly leaves: 8 pt. */
const EVEN_GAP = 8 * FIGURE_UNITS_PER_POINT

/** Place and size in print units from the page's corner; match sizes and space evenly. */
export function InspectorGeometrySection({
  context
}: {
  context: InspectorContext
}): React.JSX.Element {
  const [unit, setUnit] = useState<Unit>('pt')
  const units = selectionUnits(context.selected, context.elements)
  const one = units.length === 1 ? units[0] : null
  const scale = SCALE[unit]
  const origin = { x: context.page?.x ?? 0, y: context.page?.y ?? 0 }
  const xs = units.map((entry) => entry.box.x)
  const ys = units.map((entry) => entry.box.y)
  const box = units.length
    ? { x: Math.min(...xs), y: Math.min(...ys), width: one?.box.width, height: one?.box.height }
    : null
  const step = unit === 'pt' ? 1 : 1 / 72
  const digits = unit === 'pt' ? 1 : 3
  const commitBox = (field: 'x' | 'y' | 'width' | 'height', value: number): void => {
    const api = context.api()
    if (!api || !box) {
      return
    }
    const current = api.getSceneElementsIncludingDeleted()
    if (field === 'x' || field === 'y') {
      const target = value * scale + (field === 'x' ? origin.x : origin.y)
      const ids = new Set(units.flatMap((entry) => entry.members.map((member) => member.id)))
      const delta = target - box[field]
      context.commit(translate(current, ids, field === 'x' ? delta : 0, field === 'y' ? delta : 0))
    } else if (one) {
      context.commit(setUnitBox(current, one, { [field]: Math.max(1, value * scale) }))
    }
  }
  const toUnit = (value: number | undefined, offset = 0): number | null =>
    value === undefined ? null : (value - offset) / scale
  const scene = () => context.api()?.getSceneElementsIncludingDeleted() ?? null
  return (
    <div>
      <InspectorHeading
        aside={
          <div role="radiogroup" aria-label="Units" className="flex text-2xs">
            {(['pt', 'in'] as const).map((entry) => (
              <button
                key={entry}
                type="button"
                role="radio"
                aria-checked={unit === entry}
                className="rounded px-1 text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring aria-checked:text-foreground aria-checked:underline"
                onClick={() => setUnit(entry)}
              >
                {entry}
              </button>
            ))}
          </div>
        }
      >
        Position and size
      </InspectorHeading>
      <div className="grid grid-cols-2 gap-1 px-3">
        <InspectorNumber
          label="X"
          value={toUnit(box?.x, origin.x)}
          step={step}
          bigStep={step * 8}
          digits={digits}
          onCommit={(v) => commitBox('x', v)}
        />
        <InspectorNumber
          label="Y"
          value={toUnit(box?.y, origin.y)}
          step={step}
          bigStep={step * 8}
          digits={digits}
          onCommit={(v) => commitBox('y', v)}
        />
        <InspectorNumber
          label="W"
          value={toUnit(box?.width)}
          step={step}
          bigStep={step * 8}
          digits={digits}
          disabled={!one}
          onCommit={(v) => commitBox('width', v)}
        />
        <InspectorNumber
          label="H"
          value={toUnit(box?.height)}
          step={step}
          bigStep={step * 8}
          digits={digits}
          disabled={!one}
          onCommit={(v) => commitBox('height', v)}
        />
      </div>
      <div className="flex flex-wrap gap-0.5 px-2 pt-1">
        <InspectorAction
          label="Match width"
          disabled={units.length < 2}
          onClick={() => {
            const elements = scene()
            if (elements) {
              context.commit(matchSize(elements, units, 'width'))
            }
          }}
        >
          <MoveHorizontal aria-hidden /> Match W
        </InspectorAction>
        <InspectorAction
          label="Match height"
          disabled={units.length < 2}
          onClick={() => {
            const elements = scene()
            if (elements) {
              context.commit(matchSize(elements, units, 'height'))
            }
          }}
        >
          <MoveVertical aria-hidden /> Match H
        </InspectorAction>
        <InspectorAction
          label="Space evenly, 8 pt apart"
          disabled={units.length < 2}
          onClick={() => {
            const elements = scene()
            if (elements) {
              context.commit(spaceEvenly(elements, units, EVEN_GAP))
            }
          }}
        >
          <AlignHorizontalSpaceBetween aria-hidden /> Space 8 pt
        </InspectorAction>
      </div>
    </div>
  )
}
