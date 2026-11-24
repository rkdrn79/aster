import { useEffect, useState } from 'react'
import { Columns2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { parseResearchWindowTarget } from '../../../../shared/research-page-window'
import { RESEARCH_SPLIT_MAX_SIDES } from '../../../../shared/research-side-split'
import { RESEARCH_SPLIT_DRAG_TYPE } from './research-page-window-open'
import { openResearchProjectBeside } from './research-split-open'
import { useResearchSplit } from './research-split-store'

function carriesProject(event: DragEvent): boolean {
  return event.dataTransfer?.types.includes(RESEARCH_SPLIT_DRAG_TYPE) === true
}

/**
 * The right edge a project or page row can be dropped on to open it beside the main column. It
 * shows only while such a row is dragged, over the page and any sides, so a side's page cannot
 * swallow the drop.
 */
export function ResearchSplitDropZone(): React.JSX.Element | null {
  const [dragging, setDragging] = useState(false)
  const [over, setOver] = useState(false)
  const full = useResearchSplit((state) => state.sides.length >= RESEARCH_SPLIT_MAX_SIDES)

  useEffect(() => {
    const onStart = (event: DragEvent): void => {
      if (carriesProject(event)) {
        setDragging(true)
      }
    }
    const onEnd = (): void => {
      setDragging(false)
      setOver(false)
    }
    window.addEventListener('dragstart', onStart, true)
    window.addEventListener('dragenter', onStart, true)
    window.addEventListener('dragend', onEnd, true)
    // Why bubble, not capture: hiding the edge first would unmount it before it takes the drop.
    window.addEventListener('drop', onEnd)
    return () => {
      window.removeEventListener('dragstart', onStart, true)
      window.removeEventListener('dragenter', onStart, true)
      window.removeEventListener('dragend', onEnd, true)
      window.removeEventListener('drop', onEnd)
    }
  }, [])

  if (!dragging || full) {
    return null
  }
  return (
    <div
      data-research-split-drop-zone=""
      className="pointer-events-auto absolute inset-y-0 right-0 z-40 flex w-[clamp(140px,24%,300px)] p-2"
      onDragOver={(event) => {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault()
        const raw = event.dataTransfer.getData(RESEARCH_SPLIT_DRAG_TYPE)
        let parsed: unknown = null
        try {
          parsed = JSON.parse(raw)
        } catch {
          parsed = null
        }
        const target = parseResearchWindowTarget(parsed)
        setDragging(false)
        setOver(false)
        if (target) {
          openResearchProjectBeside(
            { id: target.workspaceId, executionHostId: target.hostId },
            target.page
          )
        }
      }}
    >
      <div
        className={cn(
          'flex flex-1 flex-col items-center justify-center gap-2 rounded-[var(--shell-radius)] border border-dashed text-sm transition-colors duration-(--duration-fast)',
          over
            ? 'border-foreground/50 bg-background text-foreground shadow-raised'
            : 'border-foreground/25 bg-background/85 text-muted-foreground'
        )}
      >
        <Columns2 className="size-4" aria-hidden />
        <span>Open to the side</span>
      </div>
    </div>
  )
}
