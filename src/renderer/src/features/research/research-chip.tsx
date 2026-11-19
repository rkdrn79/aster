import type * as React from 'react'
import { cn } from '@/lib/utils'

const TONES = {
  // A quick request or small action: a quiet fill one step up from the pane.
  fill: 'bg-secondary text-foreground hover:bg-accent',
  // A control beside chips (More, a mode toggle): no fill until hovered or pressed.
  quiet:
    'bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground'
} as const

/**
 * A chip for quick requests and small actions on the Figures, Writing and Library pages, at the
 * control radius like a button (only segmented and tab tracks stay pills). A plain button rather
 * than Button: its fill sits one step up from the pane, and a pressed chip lifts like a selected
 * segment.
 */
export function ResearchChip({
  className,
  tone = 'fill',
  type = 'button',
  ...props
}: React.ComponentProps<'button'> & { tone?: keyof typeof TONES }): React.JSX.Element {
  return (
    <button
      type={type}
      data-slot="research-chip"
      className={cn(
        "press-scale inline-flex h-7 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg px-3 text-xs whitespace-nowrap outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50 aria-pressed:bg-raised aria-pressed:text-foreground aria-pressed:shadow-raised [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
        TONES[tone],
        className
      )}
      {...props}
    />
  )
}
