import { useState, type ReactNode } from 'react'
import { isImeOwnedKeyboardEvent } from '@/lib/ime-composition-keyboard-event'

/** A section heading in the Inspector: small, quiet, with optional controls on the right. */
export function InspectorHeading({
  children,
  aside
}: {
  children: ReactNode
  aside?: ReactNode
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 px-3 pt-3 pb-1.5">
      <h3 className="flex-1 text-2xs font-medium tracking-wide text-muted-foreground uppercase">
        {children}
      </h3>
      {aside}
    </div>
  )
}

/** A toggle chip: a swatch or glyph and a short label; pressed shows the current choice. */
export function InspectorChip({
  pressed,
  label,
  title,
  children,
  disabled,
  onClick
}: {
  pressed: boolean
  label: string
  title?: string
  children?: ReactNode
  disabled?: boolean
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={title ?? label}
      title={title ?? label}
      disabled={disabled}
      className="flex h-7 min-w-0 items-center gap-1.5 rounded-md border border-border px-1.5 text-xs text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 aria-pressed:border-foreground aria-pressed:bg-accent"
      onClick={onClick}
    >
      {children}
      <span className="truncate">{label}</span>
    </button>
  )
}

/** A small text action in the Inspector. */
export function InspectorAction({
  children,
  label,
  disabled,
  onClick
}: {
  children: ReactNode
  label: string
  disabled?: boolean
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      className="flex h-6 items-center gap-1 rounded-md px-1.5 text-xs text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-3.5"
      onClick={onClick}
    >
      {children}
    </button>
  )
}

/**
 * A number in the Inspector's unit. Typing commits on Enter or blur; ↑/↓ step by `step`, with
 * Shift by `bigStep`; Esc restores.
 */
export function InspectorNumber({
  label,
  value,
  step,
  bigStep,
  digits,
  disabled,
  onCommit
}: {
  label: string
  value: number | null
  step: number
  bigStep: number
  digits: number
  disabled?: boolean
  onCommit: (value: number) => void
}): React.JSX.Element {
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? (value === null ? '' : String(Number(value.toFixed(digits))))
  const commit = (): void => {
    const parsed = Number(draft)
    if (draft !== null && draft.trim() !== '' && Number.isFinite(parsed)) {
      onCommit(parsed)
    }
    setDraft(null)
  }
  return (
    <label className="flex min-w-0 items-center gap-1 rounded-md border border-border px-1.5 text-xs focus-within:outline-2 focus-within:outline-ring">
      <span className="w-3 shrink-0 text-muted-foreground">{label}</span>
      <input
        aria-label={label}
        inputMode="decimal"
        disabled={disabled || value === null}
        placeholder="—"
        value={shown}
        className="h-6 min-w-0 flex-1 bg-transparent text-right tabular-nums outline-none disabled:opacity-50"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          event.stopPropagation()
          if (isImeOwnedKeyboardEvent(event)) {
            return
          }
          if (event.key === 'Enter') {
            commit()
          } else if (event.key === 'Escape') {
            setDraft(null)
          } else if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && value !== null) {
            event.preventDefault()
            const delta = (event.shiftKey ? bigStep : step) * (event.key === 'ArrowUp' ? 1 : -1)
            setDraft(null)
            onCommit(value + delta)
          }
        }}
      />
    </label>
  )
}
