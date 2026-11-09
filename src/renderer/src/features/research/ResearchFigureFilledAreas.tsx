import { useEffect, useRef, useState } from 'react'
import { Check, RefreshCw, X } from 'lucide-react'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { PAGE_FRAME_ID } from '../../../../research-harness/research-figures-model.mjs'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { viewportBox, type CanvasViewport, type SceneBox } from './ResearchFigureCanvasOverlays'

type FilledArea = SceneBox & { id: string; prompt: string }

function filledAreas(
  api: ExcalidrawImperativeAPI | null,
  pending: Readonly<Record<string, string>>
): FilledArea[] {
  return (api?.getSceneElements() ?? []).flatMap((element) => {
    const area = element.type === 'frame' ? element.customData?.asterArea : undefined
    const prompt: unknown = area && typeof area === 'object' ? Reflect.get(area, 'prompt') : null
    return element.id !== PAGE_FRAME_ID && typeof prompt === 'string' && !(element.id in pending)
      ? [
          {
            id: element.id,
            x: element.x,
            y: element.y,
            width: element.width,
            height: element.height,
            prompt
          }
        ]
      : []
  })
}

// Why: the bar sits just above the area, so the pointer may rest on it without leaving.
const BAR_ROOM = 30

/**
 * "✓ Filled · Regenerate · Remove area" on an area the agent filled, shown only while the pointer
 * is over it (or a keyboard user tabs into it), so finished areas stay out of the way.
 */
export function ResearchFigureFilledAreas({
  api,
  viewport,
  pending,
  containerRef,
  onRegenerate,
  onRemove
}: {
  api: ExcalidrawImperativeAPI | null
  viewport: CanvasViewport
  pending: Readonly<Record<string, string>>
  /** The canvas container, whose pointer moves decide which area is hovered. */
  containerRef: React.RefObject<HTMLElement | null>
  onRegenerate: (id: string, prompt: string) => void
  onRemove: (id: string) => void
}): React.JSX.Element | null {
  const [hovered, setHovered] = useState<string | null>(null)
  const areas = filledAreas(api, pending).map((area) => ({
    ...area,
    box: viewportBox(area, viewport)
  }))
  const boxesRef = useRef(areas)
  useEffect(() => {
    boxesRef.current = areas
  })
  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }
    const move = (event: PointerEvent): void => {
      const rect = container.getBoundingClientRect()
      const px = event.clientX - rect.left
      const py = event.clientY - rect.top
      const hit = boxesRef.current.find(
        ({ box }) =>
          px >= box.x &&
          px <= box.x + box.width &&
          py >= box.y - BAR_ROOM &&
          py <= box.y + box.height
      )
      setHovered(hit?.id ?? null)
    }
    const leave = (): void => setHovered(null)
    container.addEventListener('pointermove', move)
    container.addEventListener('pointerleave', leave)
    return () => {
      container.removeEventListener('pointermove', move)
      container.removeEventListener('pointerleave', leave)
    }
  }, [containerRef])
  if (!areas.length) {
    return null
  }
  return (
    <>
      {areas.map((area) => (
        <div
          key={area.id}
          role="group"
          aria-label={`Filled area: ${area.prompt}`}
          className={cn(
            'absolute z-10 flex -translate-x-full -translate-y-full items-center gap-0.5 rounded-md border border-border bg-background/95 py-0.5 pr-0.5 pl-2 text-2xs shadow-xs transition-opacity',
            'focus-within:pointer-events-auto focus-within:opacity-100',
            hovered === area.id
              ? 'pointer-events-auto opacity-100'
              : 'pointer-events-none opacity-0'
          )}
          style={{ left: area.box.x + area.box.width, top: area.box.y - 2 }}
        >
          <Check className="size-3 text-status-success" aria-hidden />
          <span className="text-muted-foreground">Filled</span>
          <Button
            size="xs"
            variant="ghost"
            title={`Ask again: ${area.prompt}`}
            onClick={() => onRegenerate(area.id, area.prompt)}
          >
            <RefreshCw aria-hidden /> Regenerate
          </Button>
          <Button
            size="xs"
            variant="ghost"
            title="Remove the area frame and keep its drawing"
            onClick={() => onRemove(area.id)}
          >
            <X aria-hidden /> Remove area
          </Button>
        </div>
      ))}
    </>
  )
}
