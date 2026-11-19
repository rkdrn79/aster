// The way back to the latest message once the reader has scrolled up.
//
// It stays mounted so it can fade rather than pop, and while hidden it is inert
// and hidden from assistive tech, so it can be neither clicked, tabbed to nor read.

import { ArrowDown } from 'lucide-react'
import { translate } from '@/i18n/i18n'

/** Keeps focus where the reader was typing: a pointer press never moves it here. */
function keepFocus(event: React.MouseEvent): void {
  event.preventDefault()
}

export function NativeChatJumpToLatest({
  visible,
  onJump
}: {
  visible: boolean
  onJump: () => void
}): React.JSX.Element {
  const label = translate('components.native-chat.jumpToLatest', 'Jump to latest')
  return (
    <button
      type="button"
      data-shown={visible}
      inert={!visible}
      aria-hidden={!visible || undefined}
      onMouseDown={keepFocus}
      onClick={onJump}
      className="surface-floating absolute bottom-3 left-1/2 flex h-8 -translate-x-1/2 items-center gap-2 rounded-lg px-3 text-xs font-medium transition-[opacity,translate,background-color] duration-(--duration-base) ease-out-quint hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none data-[shown=false]:pointer-events-none data-[shown=false]:translate-y-2 data-[shown=false]:opacity-0"
    >
      <ArrowDown className="size-4" />
      <span>{label}</span>
    </button>
  )
}
