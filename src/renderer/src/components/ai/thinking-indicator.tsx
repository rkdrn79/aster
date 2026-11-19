import { Hourglass } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AgentStepIcon } from './agent-steps'
import { ShimmerText } from './shimmer-text'

/**
 * The mark beside an agent's live label: a quiet ring whose arc turns. A turning mark frozen by
 * reduced motion would read as stuck, so that setting shows an hourglass instead (as
 * LoadingSpinner does).
 */
export function AgentWorkingMark({ className }: { className?: string }): React.JSX.Element {
  return (
    <>
      <AgentStepIcon status="running" className={cn('motion-reduce:hidden', className)} />
      <Hourglass
        aria-hidden="true"
        className={cn('size-4 shrink-0 motion-safe:hidden', className)}
      />
    </>
  )
}

/** "Thinking…", "Generating…": the working mark and a label with a soft sweep through it. */
export function ThinkingIndicator({
  label,
  tone = 'default',
  className
}: {
  label: React.ReactNode
  tone?: 'default' | 'chat'
  className?: string
}): React.JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex min-w-0 items-center gap-2',
        tone === 'chat' ? 'text-chat-foreground-faint' : 'text-muted-foreground',
        className
      )}
    >
      <AgentWorkingMark className="size-4" />
      <ShimmerText tone={tone} className="min-w-0 truncate">
        {label}
      </ShimmerText>
    </span>
  )
}
