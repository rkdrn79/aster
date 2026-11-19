import { cn } from '@/lib/utils'

export type ResearchProgressTone = 'ink' | 'soft' | 'muted' | 'success' | 'warning' | 'danger'

const TONES: Record<ResearchProgressTone, string> = {
  ink: 'bg-foreground/75',
  soft: 'bg-foreground/22',
  muted: 'bg-foreground/45',
  success: 'bg-status-success',
  warning: 'bg-status-warning',
  danger: 'bg-destructive'
}

/**
 * A thin rounded bar whose fills grow from the left and glide when they change: each fill is the
 * full width, slid left by what is missing, so only transform animates. Later fills sit on top of
 * earlier ones, so pass the larger one first (written, then ready). Fractions are 0–1.
 */
export function ResearchProgressBar({
  fills,
  className,
  ...aria
}: {
  fills: readonly { fraction: number; tone: ResearchProgressTone }[]
  className?: string
} & Pick<
  React.AriaAttributes,
  'aria-label' | 'aria-valuemin' | 'aria-valuemax' | 'aria-valuenow' | 'aria-hidden'
> & { role?: 'progressbar' | 'meter' }): React.JSX.Element {
  return (
    <span
      {...aria}
      className={cn('relative block h-1 overflow-hidden rounded-full bg-foreground/8', className)}
    >
      {fills.map((fill, index) => (
        <span
          key={index}
          aria-hidden
          className={cn(
            'absolute inset-0 rounded-full transition-[transform,background-color] duration-(--duration-slow) ease-out-quint motion-reduce:transition-none',
            TONES[fill.tone]
          )}
          style={{
            transform: `translateX(${(Math.max(0, Math.min(1, fill.fraction)) - 1) * 100}%)`
          }}
        />
      ))}
    </span>
  )
}
