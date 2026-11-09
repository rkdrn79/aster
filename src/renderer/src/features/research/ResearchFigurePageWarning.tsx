import { TriangleAlert } from 'lucide-react'
import { viewportBox, type CanvasViewport, type SceneBox } from './ResearchFigureCanvasOverlays'

/** An orange dashed page edge and a chip when something reaches past the print area. */
export function ResearchFigurePageWarning({
  page,
  count,
  viewport,
  onSelect
}: {
  page: SceneBox | null
  count: number
  viewport: CanvasViewport
  onSelect: () => void
}): React.JSX.Element | null {
  if (!page || count === 0) {
    return null
  }
  const box = viewportBox(page, viewport)
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute z-[5] rounded-[3px] border-2 border-dashed border-status-warning"
        style={{ left: box.x - 1, top: box.y - 1, width: box.width + 2, height: box.height + 2 }}
      />
      <button
        type="button"
        className="absolute z-10 flex items-center gap-1 rounded-full border border-status-warning-border bg-background px-2 py-0.5 text-xs text-status-warning shadow-xs hover:bg-status-warning-background focus-visible:outline-2 focus-visible:outline-ring"
        style={{ left: Math.max(8, box.x), top: Math.max(8, box.y + box.height + 8) }}
        aria-label={`Select the ${count} ${count === 1 ? 'element' : 'elements'} outside the print area`}
        onClick={onSelect}
      >
        <TriangleAlert className="size-3" aria-hidden />
        {count === 1 ? '1 element' : `${count} elements`} outside the print area
      </button>
    </>
  )
}
