import { forwardRef } from 'react'
import { cn } from '@/lib/utils'
import './ai-motion.css'

/**
 * Parts of an agent's "may I run this?" card: a raised surface that rises 8px into place, a header
 * with the request's mark and title, the command in a mono well, and a footer whose primary
 * answer is the ink pill at the right edge. Callers own the behaviour (what each answer sends,
 * focus, Escape); these only lay the decision out.
 */
export const ToolApprovalCard = forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
  function ToolApprovalCard({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        data-slot="tool-approval"
        className={cn(
          'flex flex-col gap-3 overflow-hidden rounded-xl bg-card p-4 text-card-foreground shadow-floating',
          // Rises from the composer it stands in for; a plain fade under reduced motion.
          'ai-rise',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          className
        )}
        {...props}
      />
    )
  }
)

export function ToolApprovalHeader({
  icon,
  title,
  detail,
  trailing
}: {
  icon: React.ReactNode
  title: React.ReactNode
  /** A quiet word after the title, e.g. the tool's name. */
  detail?: React.ReactNode
  trailing?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <span aria-hidden className="flex shrink-0 text-muted-foreground [&_svg]:size-4">
        {icon}
      </span>
      <div className="flex min-w-0 flex-1 items-baseline gap-2">
        <p className="line-clamp-2 min-w-0 break-words text-sm font-medium text-foreground">
          {title}
        </p>
        {detail ? (
          <span className="shrink-0 font-mono text-xs text-muted-foreground">{detail}</span>
        ) : null}
      </div>
      {trailing}
    </div>
  )
}

/** The exact thing to approve, set in mono on a sunken well. */
export function ToolApprovalWell({
  className,
  ...props
}: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      className={cn(
        'whitespace-pre-wrap break-words rounded bg-muted px-3 py-2 font-mono text-xs leading-relaxed text-foreground',
        className
      )}
      {...props}
    />
  )
}

/** The answers: quiet ones first, the primary pill last at the right edge. */
export function ToolApprovalActions({
  leading,
  className,
  children,
  ...props
}: React.ComponentProps<'div'> & { leading?: React.ReactNode }): React.JSX.Element {
  return (
    <div className={cn('flex shrink-0 flex-wrap items-center gap-2', className)} {...props}>
      {leading ? <div className="mr-auto min-w-0">{leading}</div> : null}
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">{children}</div>
    </div>
  )
}
