import './research-figure-agent.css'
import { useMemo } from 'react'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import type { FigureElement } from '../../../../research-harness/research-figures-model.mjs'
import { cn } from '@/lib/utils'
import { parseFigureText } from './research-figure-document'
import { figureElementBox } from './research-figure-selection-items'
import { sameFigureTarget, useFigureTurn } from './research-figure-turn'
import type { FigureTarget } from './research-figures-export'
import { viewportBox, type CanvasViewport, type SceneBox } from './ResearchFigureCanvasOverlays'

type Mark = { key: string; kind: 'added' | 'changed' | 'removed' | 'flash'; box: SceneBox }

const PAD = 3

const KIND_CLASS: Record<Mark['kind'], string> = {
  added: 'rounded-sm border-2 border-primary/60',
  changed: 'rounded-sm border-2 border-dashed border-status-warning',
  removed: 'rounded-sm bg-destructive/30',
  flash: 'research-figure-flash rounded-sm border-2 border-primary bg-primary/10'
}

/**
 * Marks over the canvas: what the agent's latest write touched (a 1.5 s flash) and, with Show
 * changes, what its turn added (accent outline), changed (orange dash) and removed (red ghost).
 */
export function ResearchFigureChangeMarks({
  target,
  api,
  viewport
}: {
  target: FigureTarget
  api: ExcalidrawImperativeAPI | null
  viewport: CanvasViewport
}): React.JSX.Element | null {
  const turn = useFigureTurn((state) =>
    sameFigureTarget(state.turn?.target ?? null, target) ? state.turn : null
  )
  const showChanges = useFigureTurn((state) => state.showChanges)
  const flash = useFigureTurn((state) => state.flash)
  const before = useMemo(
    () => (turn?.beforeText ? parseFigureText(turn.beforeText).elements : []),
    [turn?.beforeText]
  )
  const live: readonly FigureElement[] = api?.getSceneElements() ?? []
  const byId = new Map(live.map((element) => [element.id, element]))
  const marks: Mark[] = []
  const markLive = (kind: Mark['kind'], ids: readonly string[], key: string): void => {
    for (const id of ids) {
      const element = byId.get(id)
      if (element) {
        marks.push({ key: `${key}-${id}`, kind, box: figureElementBox(element) })
      }
    }
  }
  if (showChanges && turn?.diff) {
    markLive('added', turn.diff.added, 'added')
    markLive('changed', turn.diff.changed, 'changed')
    const removed = new Set(turn.diff.removed)
    for (const element of before) {
      if (removed.has(element.id)) {
        marks.push({
          key: `removed-${element.id}`,
          kind: 'removed',
          box: figureElementBox(element)
        })
      }
    }
  }
  if (flash && turn) {
    markLive('flash', flash.ids, `flash-${flash.at}`)
  }
  if (!marks.length) {
    return null
  }
  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden" aria-hidden>
      {marks.map((mark) => {
        const box = viewportBox(mark.box, viewport)
        return (
          <div
            key={mark.key}
            className={cn('absolute', KIND_CLASS[mark.kind])}
            style={{
              left: box.x - PAD,
              top: box.y - PAD,
              width: box.width + PAD * 2,
              height: box.height + PAD * 2
            }}
          />
        )
      })}
    </div>
  )
}
