import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** "2s ago", "4m ago", "1h ago". */
export function savedAgoText(elapsedMs: number): string {
  const seconds = Math.max(0, Math.round(elapsedMs / 1000))
  if (seconds < 60) {
    return `${seconds}s ago`
  }
  const minutes = Math.floor(seconds / 60)
  return minutes < 60 ? `${minutes}m ago` : `${Math.floor(minutes / 60)}h ago`
}

function useSecondTicks(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) {
      return
    }
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [active])
  return now
}

/**
 * The toolbar's save state at a fixed width, so nothing beside it jumps: Save, Saving…, or
 * "Saved ✓ · 2s ago". Edits save themselves 1.5 s after they stop; the button saves now.
 */
export function ResearchFigureSaveButton({
  dirty,
  busy,
  savedAt,
  onSave
}: {
  dirty: boolean
  busy: 'saving' | 'exporting' | null
  savedAt: number | null
  onSave: () => void
}): React.JSX.Element {
  const now = useSecondTicks(!dirty && savedAt !== null)
  const label =
    busy === 'saving'
      ? 'Saving…'
      : busy === 'exporting'
        ? 'Exporting…'
        : dirty
          ? 'Save'
          : savedAt === null
            ? 'Saved ✓'
            : `Saved ✓ · ${savedAgoText(Math.max(0, now - savedAt))}`
  return (
    <Button
      size="xs"
      variant={dirty ? 'secondary' : 'ghost'}
      disabled={busy !== null}
      className="w-36 shrink-0 justify-start"
      aria-label={dirty ? 'Save now (edits also save by themselves)' : label}
      title={dirty ? 'Edits save by themselves after 1.5 s; ⌘S saves now' : 'Saved'}
      onClick={onSave}
    >
      <Save aria-hidden />
      <span className="truncate tabular-nums">{label}</span>
    </Button>
  )
}
