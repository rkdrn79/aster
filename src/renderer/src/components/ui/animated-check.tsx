import { Copy } from 'lucide-react'

import { cn } from '@/lib/utils'

/** Lucide's check: pops in and draws stroke by stroke when it mounts (motion.css). */
export function AnimatedCheck({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('size-4 animate-check-in motion-reduce:animate-none', className)}
    >
      <path d="M20 6 9 17l-5-5" pathLength={1} className="draw-stroke" />
    </svg>
  )
}

/** A copy icon that shrinks away while a check draws in its place, then returns. */
export function CopyCheckIcon({
  copied,
  className
}: {
  copied: boolean
  className?: string
}): React.JSX.Element {
  return (
    <span
      aria-hidden
      data-copied={copied}
      className={cn('inline-grid size-3.5 shrink-0 place-items-center', className)}
    >
      <Copy
        className={cn(
          'col-start-1 row-start-1 size-full transition-[opacity,scale] duration-150 ease-out-quint motion-reduce:transition-opacity',
          copied && 'scale-50 opacity-0'
        )}
      />
      {copied ? <AnimatedCheck className="col-start-1 row-start-1 size-full" /> : null}
    </span>
  )
}
