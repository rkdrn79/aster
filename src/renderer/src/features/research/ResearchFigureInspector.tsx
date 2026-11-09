import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { isAsterMathImage } from './research-figure-element-meta'
import { selectionUnits } from './research-figure-geometry-edit'
import {
  registerInspectorSection,
  useInspectorSections,
  type InspectorContext
} from './research-figure-inspector-registry'
import { isPhoto } from './research-figure-photo'
import { kindOf } from './research-figure-roles'
import { InspectorGeometrySection } from './ResearchFigureInspectorGeometry'
import { InspectorPhotoSection, InspectorStyleSection } from './ResearchFigureInspectorPhoto'
import {
  badgeOwners,
  InspectorBadgeSection,
  InspectorRoleSection
} from './ResearchFigureInspectorRole'

const has = (
  context: InspectorContext,
  test: (element: InspectorContext['selected'][number]) => boolean
) => context.selected.some(test)

registerInspectorSection({
  id: 'role',
  order: 10,
  when: (context) => has(context, (element) => kindOf(element) !== null),
  render: (context) => <InspectorRoleSection context={context} />
})
registerInspectorSection({
  id: 'badge',
  order: 20,
  when: (context) => badgeOwners(context).length > 0,
  render: (context) => <InspectorBadgeSection context={context} />
})
registerInspectorSection({
  id: 'geometry',
  order: 30,
  when: (context) => context.selected.length > 0,
  render: (context) => <InspectorGeometrySection context={context} />
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
  const kind = kindOf(main)
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
  return (
    <aside
      aria-label="Inspector"
      className="absolute inset-y-0 right-0 z-10 flex w-[248px] flex-col border-l border-border bg-background"
      onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
          event.preventDefault()
          onUndo(event.shiftKey)
        }
      }}
    >
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border pr-1.5 pl-3">
        <span className="min-w-0 flex-1 truncate text-xs font-medium">{summary(context)}</span>
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
        {context.selected.length ? (
          sections.map((section) => <section key={section.id}>{section.render(context)}</section>)
        ) : (
          <p className="px-3 py-3 text-xs text-muted-foreground">
            Select something on the canvas to edit its role, place and size.
          </p>
        )}
      </div>
    </aside>
  )
}
