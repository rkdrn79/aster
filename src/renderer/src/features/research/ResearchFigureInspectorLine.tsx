import { useState } from 'react'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import { ChevronDown } from 'lucide-react'
import type { InspectorContext } from './research-figure-inspector-registry'
import {
  LINE_ENDS,
  isLine,
  isShape,
  lineEndOf,
  lineWidthPt,
  withLineEnd,
  withLineWidth,
  withPaint,
  type LineEnd,
  type Paint
} from './research-figure-line-style'
import { arrowRoles, roleOf } from './research-figure-roles'
import {
  InspectorChip,
  InspectorHeading,
  InspectorIconButton,
  InspectorNumber
} from './ResearchFigureInspectorParts'

const LINE_STYLES = ['solid', 'dashed', 'dotted'] as const

/** A 14 px glyph of a line end, drawn pointing right (the start side is mirrored). */
function EndGlyph({ end, mirrored }: { end: LineEnd; mirrored: boolean }): React.JSX.Element {
  const stem = end === 'none' || end === 'open' || end === 'bar' ? 12 : end === 'dot' ? 9 : 8.5
  return (
    <svg
      viewBox="0 0 14 14"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={mirrored ? { transform: 'scaleX(-1)' } : undefined}
    >
      <path d={`M2 7H${stem}`} />
      {end === 'triangle' ? <path d="M8.5 3.5 13 7l-4.5 3.5z" fill="currentColor" /> : null}
      {end === 'open' ? <path d="M8.5 3.5 12 7l-3.5 3.5" /> : null}
      {end === 'bar' ? <path d="M12 3.5v7" /> : null}
      {end === 'dot' ? <circle cx={10.75} cy={7} r={2} fill="currentColor" /> : null}
    </svg>
  )
}

function EndRow({
  side,
  current,
  onPick
}: {
  side: 'start' | 'end'
  current: LineEnd | null
  onPick: (end: LineEnd) => void
}): React.JSX.Element {
  const name = side === 'start' ? 'Start' : 'End'
  return (
    <div role="group" aria-label={`${name} of the line`} className="flex items-center px-2">
      <span className="w-12 shrink-0 pl-1 text-2xs text-muted-foreground">{name}</span>
      {LINE_ENDS.map((entry) => (
        <InspectorIconButton
          key={entry.end}
          label={`${name}: ${entry.label.toLowerCase()}`}
          pressed={current === entry.end}
          onClick={() => onPick(entry.end)}
        >
          <EndGlyph end={entry.end} mirrored={side === 'start'} />
        </InspectorIconButton>
      ))}
    </div>
  )
}

/**
 * Line style, width in points, the ends of arrows (PowerPoint's Format Shape › Line), and colours
 * outside the paper palette behind Custom…. A fill paints shapes only, never their labels.
 */
export function InspectorStyleSection({
  context
}: {
  context: InspectorContext
}): React.JSX.Element {
  const [custom, setCustom] = useState(false)
  const strokes = new Set(context.selected.map((element) => element.strokeStyle))
  const current = strokes.size === 1 ? [...strokes][0] : null
  const first = context.selected[0]
  // Why per field: in a box's group the first element may be a label line, which has no fill.
  const source = {
    strokeColor: context.selected.find((element) => isShape(element) || isLine(element)) ?? first,
    backgroundColor: context.selected.find(isShape) ?? first
  }
  const arrows = context.selected.some((element) => element.type === 'arrow')
  const width = lineWidthPt(context.selected)
  const ids = new Set(context.selected.map((element) => element.id))
  const run = (edit: (elements: readonly ExcalidrawElement[]) => ExcalidrawElement[]): void => {
    const elements = context.api()?.getSceneElementsIncludingDeleted()
    if (elements) {
      context.commit(edit(elements))
    }
  }
  const paint = (update: Paint): void => run((elements) => withPaint(elements, ids, update))
  const roleWidth = (element: ExcalidrawElement): number | null => {
    const role = isLine(element) ? roleOf(element, context.style) : null
    return arrowRoles(context.style).find((entry) => entry.role === role)?.paint.strokeWidth ?? null
  }
  return (
    <div className="pb-3">
      <InspectorHeading>Line</InspectorHeading>
      <div className="grid grid-cols-3 gap-1 px-3" role="group" aria-label="Line style">
        {LINE_STYLES.map((style) => (
          <InspectorChip
            key={style}
            pressed={current === style}
            label={style}
            title={`${style} line`}
            onClick={() => paint({ strokeStyle: style })}
          />
        ))}
      </div>
      <div className="flex items-center gap-1 px-3 pt-1">
        <span className="w-10 shrink-0 text-2xs text-muted-foreground">Width</span>
        <div className="min-w-0 flex-1">
          <InspectorNumber
            label="pt"
            name="Line width in pt"
            value={width}
            mixed={width === null}
            step={0.25}
            bigStep={1}
            digits={2}
            onCommit={(pt) => run((elements) => withLineWidth(elements, ids, pt, roleWidth))}
          />
        </div>
      </div>
      {arrows ? (
        <div className="pt-1">
          {(['start', 'end'] as const).map((side) => (
            <EndRow
              key={side}
              side={side}
              current={lineEndOf(context.selected, side)}
              onPick={(end) => run((elements) => withLineEnd(elements, ids, side, end))}
            />
          ))}
        </div>
      ) : null}
      <button
        type="button"
        aria-expanded={custom}
        className="mx-3 mt-2 flex items-center gap-1 rounded text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        onClick={() => setCustom(!custom)}
      >
        Custom… <ChevronDown className="size-4" aria-hidden />
      </button>
      {custom ? (
        <div className="space-y-2 px-3 pt-2 text-xs">
          {(['strokeColor', 'backgroundColor'] as const).map((field) => (
            <label key={field} className="flex items-center gap-2">
              <span className="w-14 text-muted-foreground">
                {field === 'strokeColor' ? 'Outline' : 'Fill'}
              </span>
              <input
                type="color"
                aria-label={field === 'strokeColor' ? 'Outline colour' : 'Fill colour'}
                value={
                  /^#[0-9a-f]{6}$/i.test(source[field]?.[field] ?? '')
                    ? source[field]?.[field]
                    : '#ffffff'
                }
                className="h-6 w-10 cursor-pointer rounded border border-border bg-transparent"
                onChange={(event) => paint({ [field]: event.target.value })}
              />
              <span className="font-mono text-muted-foreground">{source[field]?.[field]}</span>
            </label>
          ))}
          <label className="flex items-center gap-2">
            <span className="w-14 text-muted-foreground">Opacity</span>
            <input
              type="range"
              aria-label="Opacity"
              min={10}
              max={100}
              step={10}
              value={first?.opacity ?? 100}
              className="flex-1 accent-foreground"
              onChange={(event) => paint({ opacity: Number(event.target.value) })}
            />
          </label>
        </div>
      ) : null}
    </div>
  )
}
