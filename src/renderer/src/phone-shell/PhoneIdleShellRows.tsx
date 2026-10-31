import { ChevronDown, SquareTerminal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePhoneNavigation } from './phone-navigation-store'
import type { PhoneSession } from './phone-sessions'
import { PhoneRow } from './PhoneListLayout'

/**
 * Plain shells at a prompt or no longer running, folded behind one row so agents and live work
 * lead the list. Renders rows only; the caller's section frames them.
 */
export function PhoneIdleShellRows({
  sessions,
  renderRow
}: {
  sessions: readonly PhoneSession[]
  renderRow: (session: PhoneSession) => React.ReactNode
}): React.JSX.Element | null {
  const shown = usePhoneNavigation((state) => state.idleShellsShown)
  const setShown = usePhoneNavigation((state) => state.setIdleShellsShown)
  if (sessions.length === 0) {
    return null
  }
  const count = sessions.length
  return (
    <>
      <PhoneRow
        leading={<SquareTerminal className="size-[18px]" aria-hidden />}
        title={
          shown ? 'Hide idle terminals' : `Show ${count} idle terminal${count === 1 ? '' : 's'}`
        }
        subtitle={shown ? undefined : 'At a prompt or no longer running'}
        trailing={
          <ChevronDown
            className={cn(
              'size-4 text-muted-foreground transition-transform motion-reduce:transition-none',
              shown && 'rotate-180'
            )}
            aria-hidden
          />
        }
        aria-expanded={shown}
        onClick={() => setShown(!shown)}
      />
      {shown ? sessions.map(renderRow) : null}
    </>
  )
}
