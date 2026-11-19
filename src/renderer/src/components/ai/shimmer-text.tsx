import { cn } from '@/lib/utils'

const TONES = {
  // App surfaces: muted text with a foreground sweep.
  default: '',
  // Inside a chat: the chat's own faint and strong text tokens.
  chat: '[--shimmer-base:var(--chat-foreground-faint)] [--shimmer-highlight:var(--chat-foreground-strong)]'
} as const

/**
 * Text that a soft highlight sweeps through while an agent works ("Thinking…", "Generating…").
 * `active={false}` leaves a plain label, so a finished state needs no second element. Under
 * reduced motion the sweep stops and the label stays readable (motion.css `text-shimmer`).
 */
export function ShimmerText({
  children,
  active = true,
  tone = 'default',
  className,
  id
}: {
  children: React.ReactNode
  active?: boolean
  tone?: keyof typeof TONES
  className?: string
  id?: string
}): React.JSX.Element {
  return (
    <span
      id={id}
      data-shimmer={active ? 'on' : undefined}
      className={cn(active && 'text-shimmer', active && TONES[tone], className)}
    >
      {children}
    </span>
  )
}
