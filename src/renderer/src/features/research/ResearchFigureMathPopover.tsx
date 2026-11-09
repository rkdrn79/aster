import { useRef, useState } from 'react'
import { Sigma, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FIGURE_UNITS_PER_POINT } from '../../../../research-harness/research-figures-model.mjs'
import { typesetFigureMath } from './research-figure-math'
import type { FigureMath } from './research-figure-math-scene'
import type { SceneBox } from './ResearchFigureCanvasOverlays'

export type MathInk = { name: string; color: string }

export type MathPreview = { dataURL: string; width: number; height: number }

type Props = {
  title: string
  initial: FigureMath
  /** The initial TeX typeset (or the error it gave), so the preview shows at once. */
  initialPreview: MathPreview | string
  inks: readonly MathInk[]
  /** Where the math sits, in canvas pixels; null opens at the top. */
  anchor: SceneBox | null
  onApply: (math: FigureMath) => Promise<void>
  onCancel: () => void
}

/** TeX, size and ink for one math label, with a live preview; Enter applies, Esc cancels. */
export function ResearchFigureMathPopover({
  title,
  initial,
  initialPreview,
  inks,
  anchor,
  onApply,
  onCancel
}: Props): React.JSX.Element {
  const [tex, setTex] = useState(initial.tex)
  const [sizePt, setSizePt] = useState(initial.size / FIGURE_UNITS_PER_POINT)
  const [color, setColor] = useState(initial.color)
  const [preview, setPreview] = useState<MathPreview | null>(
    typeof initialPreview === 'string' ? null : initialPreview
  )
  const [error, setError] = useState<string | null>(
    typeof initialPreview === 'string' && initial.tex.trim() ? initialPreview : null
  )
  const [busy, setBusy] = useState(false)
  const request = useRef(0)

  const typeset = (next: { tex: string; sizePt: number; color: string }): void => {
    const token = ++request.current
    typesetFigureMath(next.tex, next.sizePt * FIGURE_UNITS_PER_POINT, next.color).then(
      (result) => {
        if (token === request.current) {
          setPreview(result)
          setError(null)
        }
      },
      (cause: unknown) => {
        if (token === request.current) {
          setError(cause instanceof Error ? cause.message : String(cause))
        }
      }
    )
  }
  const change = (next: Partial<{ tex: string; sizePt: number; color: string }>): void => {
    const merged = { tex, sizePt, color, ...next }
    setTex(merged.tex)
    setSizePt(merged.sizePt)
    setColor(merged.color)
    typeset(merged)
  }
  const apply = async (): Promise<void> => {
    if (error || busy || !tex.trim()) {
      return
    }
    setBusy(true)
    try {
      await onApply({ tex, size: sizePt * FIGURE_UNITS_PER_POINT, color })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const style = anchor
    ? { left: Math.max(8, anchor.x), top: Math.max(8, anchor.y + anchor.height + 8) }
    : { left: '50%', top: 12, transform: 'translateX(-50%)' }
  const scale = preview ? Math.min(3, 240 / Math.max(preview.width, 1), 56 / preview.height) : 1
  return (
    <div
      role="dialog"
      aria-label={title}
      className="absolute z-30 w-80 max-w-[calc(100%-1rem)] rounded-md border border-border bg-popover p-2 text-popover-foreground shadow-md"
      style={style}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          onCancel()
        }
      }}
    >
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium">
        <Sigma className="size-3.5" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{title}</span>
        <Button size="icon-xs" variant="ghost" aria-label="Cancel" onClick={onCancel}>
          <X aria-hidden />
        </Button>
      </div>
      <Input
        autoFocus
        aria-label="TeX"
        value={tex}
        spellCheck={false}
        placeholder="e.g. f_\theta(x)"
        density="compact"
        onChange={(event) => change({ tex: event.target.value })}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            void apply()
          }
        }}
      />
      <div
        className="mt-1.5 flex h-16 items-center justify-center overflow-hidden rounded-sm border border-border bg-white"
        aria-label="Preview"
        role="img"
      >
        {preview ? (
          <img
            alt={tex}
            src={preview.dataURL}
            style={{ width: preview.width * scale, height: preview.height * scale }}
          />
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <div className="mt-1.5 flex items-center gap-1.5 text-xs">
        <label className="flex items-center gap-1 text-muted-foreground">
          Size
          <Input
            type="number"
            aria-label="Size in points"
            min={4}
            max={24}
            step={0.5}
            value={sizePt}
            density="compact"
            className="w-16"
            onChange={(event) => {
              const value = Number(event.target.value)
              if (Number.isFinite(value) && value >= 4 && value <= 24) {
                change({ sizePt: value })
              }
            }}
          />
          pt
        </label>
        <div role="radiogroup" aria-label="Ink" className="ml-auto flex items-center gap-1">
          {inks.map((ink) => (
            <button
              key={ink.name}
              type="button"
              role="radio"
              aria-checked={color.toLowerCase() === ink.color.toLowerCase()}
              aria-label={`Ink: ${ink.name}`}
              title={ink.name}
              className="size-5 rounded-full border border-border outline-offset-1 aria-checked:outline-2 aria-checked:outline-foreground focus-visible:outline-2 focus-visible:outline-ring"
              style={{ backgroundColor: ink.color }}
              onClick={() => change({ color: ink.color })}
            />
          ))}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-end gap-1.5">
        <span className="mr-auto text-2xs text-muted-foreground">
          Enter to apply · Esc to cancel
        </span>
        <Button size="xs" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="xs"
          disabled={Boolean(error) || busy || !tex.trim()}
          onClick={() => void apply()}
        >
          {busy ? 'Applying…' : 'Apply'}
        </Button>
      </div>
    </div>
  )
}
