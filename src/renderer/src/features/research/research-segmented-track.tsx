import type * as React from 'react'
import { SegmentIndicator, useSegmentIndicator } from '@/components/ui/segment-indicator'
import { cn } from '@/lib/utils'

/**
 * A pill track whose one raised highlight slides to the child marked `data-state="active"`, for
 * pages whose tabs and single-choice buttons keep their own roles (tab, aria-pressed) rather than
 * the Tabs or ToggleGroup primitives. Children must be the track's direct children.
 */
export function ResearchSegmentedTrack({
  className,
  children,
  enabled = true,
  ref,
  ...props
}: React.ComponentProps<'div'> & { enabled?: boolean }): React.JSX.Element {
  const setTrack = useSegmentIndicator<HTMLDivElement>('[data-state="active"]', enabled, ref)
  return (
    <div
      {...props}
      ref={setTrack}
      className={cn(
        'group/segmented relative flex items-center gap-0.5 rounded-full bg-muted p-0.5',
        className
      )}
    >
      <SegmentIndicator />
      {children}
    </div>
  )
}

/** An item on the track; the active one paints its own highlight until the slide is measured. */
export function researchSegmentClass(active: boolean, className?: string): string {
  return cn(
    'relative inline-flex h-6 items-center justify-center gap-1 rounded-full px-3 text-xs font-medium whitespace-nowrap text-muted-foreground transition-colors duration-(--duration-fast) hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring',
    active &&
      'bg-raised text-foreground shadow-raised group-data-[segment-indicator]/segmented:bg-transparent group-data-[segment-indicator]/segmented:shadow-none',
    className
  )
}
