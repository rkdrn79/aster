import { useState } from 'react'
import { Layers, Lock, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { isAsterMathImage } from './research-figure-element-meta'
import { selectionUnits } from './research-figure-geometry-edit'
import { allLocked, lockTargets, toggleSelectionLock } from './research-figure-lock'
import { isPanelElement } from './research-figure-panel-fit'
import {
  registerInspectorSection,
  useInspectorSections,
  type InspectorContext
} from './research-figure-inspector-registry'
import { isPhoto } from './research-figure-photo'
import { kindOf } from './research-figure-roles'
import { InspectorAlignSection } from './ResearchFigureInspectorAlign'
import { InspectorGeometrySection } from './ResearchFigureInspectorGeometry'
import { InspectorIllustrationSection } from './ResearchFigureInspectorIllustration'
import { isIllustration } from './research-figure-illustration'
import { InspectorStyleSection } from './ResearchFigureInspectorLine'
import { InspectorPaintSection } from './ResearchFigureInspectorPaint'
import { InspectorPhotoSection } from './ResearchFigureInspectorPhoto'
import {
  badgeOwners,
  InspectorBadgeSection,
  InspectorRoleSection
} from './ResearchFigureInspectorRole'
import { InspectorSelectSection } from './ResearchFigureInspectorSelect'
import { ResearchFigureLayersPanel } from './ResearchFigureLayersPanel'
import { hasFigureText, InspectorTextSection } from './ResearchFigureInspectorText'

const has = (
  context: InspectorContext,
  test: (element: InspectorContext['selected'][number]) => boolean
) => context.selected.some(test)

registerInspectorSection({
  id: 'select-same',
  order: 5,
  when: (context) => context.selected.length > 0,
  render: (context) => <InspectorSelectSection context={context} />
})
registerInspectorSection({
  id: 'role',
  order: 10,
  when: (context) => has(context, (element) => kindOf(element) !== null),
  render: (context) => <InspectorRoleSection context={context} />
})
registerInspectorSection({
  id: 'text-size',
  order: 15,
  when: hasFigureText,
  render: (context) => <InspectorTextSection context={context} />
})
registerInspectorSection({
  id: 'badge',
  order: 20,
  when: (context) => badgeOwners(context).length > 0,
  render: (context) => <InspectorBadgeSection context={context} />
})
registerInspectorSection({
  id: 'align',
  order: 25,
  when: (context) => context.selected.length > 0,
  render: (context) => <InspectorAlignSection context={context} />
})
registerInspectorSection({
  id: 'geometry',
  order: 30,
  when: (context) => context.selected.length > 0,
  render: (context) => <InspectorGeometrySection context={context} />
})
registerInspectorSection({
  id: 'illustration',
  order: 35,
  when: (context) => has(context, isIllustration),
  render: (context) => <InspectorIllustrationSection context={context} />
})
registerInspectorSection({
  id: 'photo',
  order: 40,
  when: (context) => has(context, isPhoto),
  render: (context) => <InspectorPhotoSection context={context} />
})
registerInspectorSection({
  id: 'style',
  order: 60,
  when: (context) =>
    has(context, (element) => kindOf(element) === 'shape' || kindOf(element) === 'arrow'),
  render: (context) => <InspectorStyleSection context={context} />
})

registerInspectorSection({
  id: 'paint-style',
  order: 65,
  when: (context) => context.selected.length > 0,
  render: (context) => <InspectorPaintSection context={context} />
})

/** "Locked · Unlock" in the header while the selection is locked (Figma's lock in layers). */
function LockedChip({ context }: { context: InspectorContext }): React.JSX.Element | null {
  if (!allLocked(lockTargets(context.selected, context.elements))) {
    return null
  }
  return (
    <span className="flex shrink-0 items-center gap-1 text-2xs text-muted-foreground">
      <Lock className="size-3" aria-hidden />
      Locked ·
      <button
        type="button"
        className="rounded text-foreground underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
        title="Unlock (⌥⌘L)"
        onClick={() => {
          const api = context.api()
          if (api) {
            toggleSelectionLock(api)
          }
        }}
      >
        Unlock
      </button>
    </span>
  )
}

function summary(context: InspectorContext): string {
  const units = selectionUnits(context.selected, context.elements)
  if (!units.length) {
    return 'Nothing selected'
  }
  if (units.length > 1) {
    return `${units.length} selected`
  }
  const main = units[0].primary
  if (isAsterMathImage(main)) {
    return 'Math'
  }
  if (isPhoto(main)) {
    return 'Photo'
  }
  if (isIllustration(main)) {
    return 'Illustration'
  }
  const kind = kindOf(main)
  if (isPanelElement(main)) {
    return 'Panel'
  }
  return kind === 'shape'
    ? 'Box'
    : kind === 'arrow'
      ? 'Arrow'
      : kind === 'text'
        ? 'Text'
        : 'Element'
}

/**
 * The fixed column beside the canvas for what is selected: role, badge, place and size, photo
 * and line. Other tracks add sections with `registerInspectorSection`.
 */
export function ResearchFigureInspector({
  context,
  onClose,
  onUndo
}: {
  context: InspectorContext
  onClose: () => void
  /** ⌘Z / ⌘⇧Z here still undo on the canvas. */
  onUndo: (redo: boolean) => void
}): React.JSX.Element {
  const sections = useInspectorSections().filter((section) => section.when(context))
  // Why in the same column: PowerPoint's Selection Pane and Figma's layers sit beside the
  // properties; one 248 px column keeps the canvas as wide as it was.
  const [layers, setLayers] = useState(false)
  return (
    <aside
      aria-label="Inspector"
      className="research-panel-in-right surface-floating absolute top-2 right-2 bottom-2 z-10 flex w-[248px] flex-col overflow-hidden rounded-2xl"
      onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
          event.preventDefault()
          onUndo(event.shiftKey)
        }
      }}
    >
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border pr-2 pl-3">
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
          {layers ? 'Layers' : summary(context)}
        </span>
        {layers ? null : <LockedChip context={context} />}
        <Button
          size="icon-xs"
          variant={layers ? 'secondary' : 'ghost'}
          aria-label="Layers"
          aria-pressed={layers}
          title={layers ? 'Back to the Inspector' : 'Layers: every thing on the figure, top first'}
          onClick={() => setLayers(!layers)}
        >
          <Layers aria-hidden />
        </Button>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="Close the Inspector (⌘I)"
          title="Close (⌘I)"
          onClick={onClose}
        >
          <X aria-hidden />
        </Button>
      </div>
      <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto pb-3">
        {layers ? (
          <div className="px-1">
            <ResearchFigureLayersPanel api={context.api} />
          </div>
        ) : context.selected.length ? (
          sections.map((section) => <section key={section.id}>{section.render(context)}</section>)
        ) : (
          <p className="px-3 py-3 text-xs text-muted-foreground">
            Select something on the canvas to edit its role, place and size
          </p>
        )}
      </div>
    </aside>
  )
}
