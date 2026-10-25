import { cn } from '@/lib/utils'

// Why: Relay ships in the public builds but is still beta; keep a quiet
// qualifier wherever the Relay path is offered.
export function MobileRelayBetaNotice({ className }: { className?: string }): React.JSX.Element {
  return (
    <p className={cn('text-[11px] text-muted-foreground', className)}>
      Hosted access requires a configured relay service.
    </p>
  )
}
