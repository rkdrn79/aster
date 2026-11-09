import { useRef, useState } from 'react'
import { Loader2, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

export type CanvasViewport = { scrollX: number; scrollY: number; zoom: number }
export type SceneBox = { x: number; y: number; width: number; height: number }

/** A scene box in the canvas container's pixels. */
export function viewportBox(box: SceneBox, viewport: CanvasViewport): SceneBox {
  return {
    x: (box.x + viewport.scrollX) * viewport.zoom,
    y: (box.y + viewport.scrollY) * viewport.zoom,
    width: box.width * viewport.zoom,
    height: box.height * viewport.zoom
  }
}

/** Ready-made requests for a selection; a chip fills the prompt, it does not send it. */
export const ASK_CHIPS: readonly { label: string; prompt: string }[] = [
  { label: 'Align', prompt: 'Align these and space them evenly.' },
  { label: 'Same size', prompt: 'Give these the same size.' },
  { label: 'Make consistent', prompt: 'Make these consistent in style, size and spacing.' },
  { label: 'Connect', prompt: 'Connect these with arrows in reading order.' },
  { label: 'Explain', prompt: 'Explain what these show; change nothing.' }
]

const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform)

type AskProps = {
  title: string
  placeholder: string
  /** Where to open, in container pixels (it opens under this box); null centers it at the top. */
  anchor: SceneBox | null
  /** Chips that fill the prompt (Ask about selection). */
  chips?: readonly { label: string; prompt: string }[]
  error: string | null
  sending: boolean
  onSend: (prompt: string) => void
  onCancel: () => void
}

/** The small prompt box Generate in area and Ask about selection open on the canvas. */
export function ResearchFigureAskBox({
  title,
  placeholder,
  anchor,
  chips,
  error,
  sending,
  onSend,
  onCancel
}: AskProps): React.JSX.Element {
  const [prompt, setPrompt] = useState('')
  const fieldRef = useRef<HTMLTextAreaElement | null>(null)
  const send = (): void => {
    if (prompt.trim() && !sending) {
      onSend(prompt.trim())
    }
  }
  const style = anchor
    ? { left: Math.max(8, anchor.x), top: Math.max(8, anchor.y + anchor.height + 8) }
    : { left: '50%', top: 12, transform: 'translateX(-50%)' }
  return (
    <div
      role="dialog"
      aria-label={title}
      className="absolute z-20 w-80 max-w-[calc(100%-1rem)] rounded-md border border-border bg-popover p-2 text-popover-foreground shadow-md"
      style={style}
    >
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium">
        <Sparkles className="size-3.5 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate" title={title}>
          {title}
        </span>
        <Button size="icon-xs" variant="ghost" aria-label="Cancel" onClick={onCancel}>
          <X aria-hidden />
        </Button>
      </div>
      {chips?.length ? (
        <div className="mb-1.5 flex flex-wrap gap-1" role="group" aria-label="Suggested requests">
          {chips.map((chip) => (
            <Button
              key={chip.label}
              size="xs"
              variant="outline"
              onClick={() => {
                setPrompt(chip.prompt)
                fieldRef.current?.focus()
              }}
            >
              {chip.label}
            </Button>
          ))}
        </div>
      ) : null}
      <Textarea
        ref={fieldRef}
        autoFocus
        value={prompt}
        rows={3}
        placeholder={placeholder}
        aria-label={title}
        className="min-h-16"
        onChange={(event) => setPrompt(event.target.value)}
        onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            send()
          } else if (event.key === 'Escape') {
            event.preventDefault()
            onCancel()
          }
        }}
      />
      {error ? (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <div className="mt-1.5 flex items-center justify-end gap-1.5">
        <span className="mr-auto text-2xs text-muted-foreground">
          {isMac ? '⌘↵' : 'Ctrl+Enter'} to send · Esc to close
        </span>
        <Button size="xs" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="xs" disabled={!prompt.trim() || sending} onClick={send}>
          {sending ? 'Sending…' : 'Send to agent'}
        </Button>
      </div>
    </div>
  )
}

/** "Generating…" over each area the agent is still filling. */
export function ResearchFigurePendingAreas({
  areas,
  viewport,
  onDismiss
}: {
  areas: readonly (SceneBox & { id: string })[]
  viewport: CanvasViewport
  onDismiss: (id: string) => void
}): React.JSX.Element {
  return (
    <>
      {areas.map((area) => {
        const box = viewportBox(area, viewport)
        return (
          <div
            key={area.id}
            className="pointer-events-none absolute z-10 flex items-center justify-center rounded-sm bg-background/60"
            style={{ left: box.x, top: box.y, width: box.width, height: box.height }}
          >
            <span
              role="status"
              className="pointer-events-auto flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-xs text-muted-foreground shadow-xs"
            >
              <Loader2 className="size-3 animate-spin" aria-hidden />
              Generating…
              <button
                type="button"
                aria-label="Stop waiting for this area"
                className="ml-0.5 rounded-sm hover:text-foreground"
                onClick={() => onDismiss(area.id)}
              >
                <X className="size-3" aria-hidden />
              </button>
            </span>
          </div>
        )
      })}
    </>
  )
}
