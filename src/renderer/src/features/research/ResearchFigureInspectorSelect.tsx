import type { InspectorContext } from './research-figure-inspector-registry'
import {
  canSelectSame,
  runSelectSame,
  selectedKinds,
  type SameKey
} from './research-figure-select-same'
import { InspectorHeading } from './ResearchFigureInspectorParts'

const KIND_NAMES: Record<string, string> = { shape: 'boxes', arrow: 'arrows', text: 'labels' }

function kindName(kinds: readonly string[]): string {
  return kinds.length === 1 ? (KIND_NAMES[kinds[0]] ?? 'of this kind') : 'of these kinds'
}

/**
 * "Select same" (Figma's Select matching layers, Illustrator's Select › Same): from what is
 * selected, select every box, arrow or label in the figure with the same look, fill, line,
 * badge or text size, so one edit reaches all of them.
 */
export function InspectorSelectSection({
  context
}: {
  context: InspectorContext
}): React.JSX.Element {
  const keys: readonly [SameKey, string][] = [
    ['look', 'Look'],
    ['fill', 'Fill'],
    ['line', 'Line'],
    ['badge', 'Badge'],
    ['text', 'Text size'],
    ['kind', `All ${kindName(selectedKinds(context.selected, context.elements))}`]
  ]
  const shown = keys.filter(([key]) =>
    canSelectSame(key, context.selected, context.elements, context.style)
  )
  return (
    <div>
      <InspectorHeading aside={<span className="text-2xs text-muted-foreground">⌥⌘A</span>}>
        Select same
      </InspectorHeading>
      <div role="group" aria-label="Select same" className="flex flex-wrap gap-1 px-3">
        {shown.map(([key, label]) => (
          <button
            key={key}
            type="button"
            title={`Select everything with the same ${key === 'kind' ? 'kind' : label.toLowerCase()}`}
            className="h-6 rounded-md border border-border px-1.5 text-2xs text-foreground transition-colors duration-150 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
            onClick={() => {
              const api = context.api()
              if (api) {
                runSelectSame(api, key, context.style)
              }
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
