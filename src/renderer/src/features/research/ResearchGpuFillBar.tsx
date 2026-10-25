import { cn } from '@/lib/utils'

/** How full a set of GPUs is: green for allocated, muted track for the rest. */
export function ResearchGpuFillBar({
  used,
  total,
  label,
  unavailable = false,
  className
}: {
  used: number
  total: number
  label: string
  /** A node that takes no jobs (down, drained): drawn faded so it reads as out of the pool. */
  unavailable?: boolean
  className?: string
}): React.JSX.Element {
  const percent = total ? Math.min(100, (used / total) * 100) : 0
  return (
    <div
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        'h-2 overflow-hidden rounded-full bg-muted',
        unavailable && 'opacity-40',
        className
      )}
    >
      <div className="h-full rounded-full bg-status-success" style={{ width: `${percent}%` }} />
    </div>
  )
}
