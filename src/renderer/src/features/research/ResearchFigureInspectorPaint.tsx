import { useEffect } from 'react'
import { ClipboardPaste, Copy, Paintbrush, X } from 'lucide-react'
import { addAppKeyListener, removeAppKeyListener } from '@/lib/app-keyboard-router'
import type { InspectorContext } from './research-figure-inspector-registry'
import { describeStyleCopy } from './research-figure-paint-style'
import { InspectorAction, InspectorHeading } from './ResearchFigureInspectorParts'
import {
  armPainter,
  copySelectionStyle,
  disarmPainter,
  pasteSelectionStyle,
  useFigurePainter
} from './use-figure-painter'

const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform)
const chord = (key: string): string => (isMac ? `⌥⌘${key}` : `Ctrl+Alt+${key}`)

/**
 * PowerPoint's Format Painter and Figma's copy and paste properties: copy the style of the first
 * thing selected (box, line and label apart), paint it on the next click, or keep painting.
 */
export function InspectorPaintSection({
  context
}: {
  context: InspectorContext
}): React.JSX.Element {
  const copy = useFigurePainter((state) => state.copy)
  const armed = useFigurePainter((state) => state.armed)
  const withApi = (run: (api: NonNullable<ReturnType<InspectorContext['api']>>) => void) => () => {
    const api = context.api()
    if (api) {
      run(api)
    }
  }
  return (
    <div>
      <InspectorHeading
        aside={
          copy ? (
            <span
              className="truncate text-2xs text-muted-foreground"
              title={describeStyleCopy(copy)}
            >
              {describeStyleCopy(copy)}
            </span>
          ) : null
        }
      >
        Style
      </InspectorHeading>
      <div className="flex flex-wrap items-center gap-0.5 px-2">
        <button
          type="button"
          aria-pressed={armed !== null}
          aria-label="Format painter: click paints the next thing; double-click keeps painting until Esc"
          title="Format painter: click paints the next thing; double-click keeps painting until Esc"
          className="flex h-7 items-center gap-2 rounded-lg px-2 text-xs text-foreground transition-colors duration-150 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring aria-pressed:bg-accent [&_svg]:size-4 [&_svg]:text-muted-foreground"
          onClick={(event) => {
            const api = context.api()
            if (!api || event.detail > 1) {
              return
            }
            if (armed) {
              disarmPainter()
              return
            }
            armPainter(api, 'once')
          }}
          onDoubleClick={withApi((api) => armPainter(api, 'sticky'))}
        >
          <Paintbrush aria-hidden /> Painter
        </button>
        <InspectorAction label={`Copy style (${chord('C')})`} onClick={withApi(copySelectionStyle)}>
          <Copy aria-hidden /> Copy
        </InspectorAction>
        <InspectorAction
          label={`Paste style (${chord('V')})`}
          disabled={!copy}
          onClick={withApi((api) => pasteSelectionStyle(api, context.commit))}
        >
          <ClipboardPaste aria-hidden /> Paste
        </InspectorAction>
      </div>
    </div>
  )
}

/** While the painter is on: what it does and how to stop it, at the top of the canvas. */
export function ResearchFigurePainterPill(): React.JSX.Element | null {
  const armed = useFigurePainter((state) => state.armed)
  useEffect(() => {
    if (!armed) {
      return
    }
    // Why on the window: after a double-click on the Inspector's painter, focus is there, not on
    // the canvas, and Esc must still stop painting.
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        disarmPainter()
      }
    }
    addAppKeyListener('keydown', onKey)
    return () => removeAppKeyListener('keydown', onKey)
  }, [armed])
  if (!armed) {
    return null
  }
  return (
    <div
      role="status"
      className="research-canvas-island research-pop-in absolute top-3 left-1/2 z-10 flex h-7 -translate-x-1/2 items-center gap-2 rounded-lg pr-1 pl-3 text-xs [&_svg]:size-4"
    >
      <Paintbrush aria-hidden />
      {armed === 'sticky'
        ? 'Painting style: click things to paint them · Esc stops'
        : 'Click a thing to paint the copied style · Esc cancels'}
      <button
        type="button"
        aria-label="Stop painting"
        className="research-canvas-tool flex size-5 items-center justify-center rounded-md"
        onClick={disarmPainter}
      >
        <X aria-hidden />
      </button>
    </div>
  )
}
