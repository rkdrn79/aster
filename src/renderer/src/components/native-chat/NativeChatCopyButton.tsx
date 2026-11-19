import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { CopyCheckIcon } from '@/components/ui/animated-check'
import { translate } from '@/i18n/i18n'
import { NATIVE_CHAT_ROW_ACTION_CLASS } from './native-chat-row-action'

/**
 * Per-message copy affordance for the native chat. Copies the message's text to
 * the clipboard and briefly turns the icon into a drawn check as success feedback —
 * matching the app's other inline copy buttons (icon swap, no toast). Uses
 * Electron's clipboard IPC, which wraps navigator.clipboard.writeText and avoids
 * the silent failures navigator.clipboard hits inside some renderer contexts.
 */
export function NativeChatCopyButton({
  text,
  label: copyLabel,
  className
}: {
  text: string
  /** What this button copies, when it is not the whole message. */
  label?: string
  className?: string
}): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  const resetTimerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current)
      }
    }
  }, [])

  const handleCopy = useCallback(async () => {
    try {
      await window.api.ui.writeClipboardText(text)
      setCopied(true)
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current)
      }
      resetTimerRef.current = window.setTimeout(() => {
        resetTimerRef.current = null
        setCopied(false)
      }, 1500)
    } catch {
      /* best-effort: clipboard can reject when unfocused */
    }
  }, [text])

  const label = copied
    ? translate('components.native-chat.copyMessage.copied', 'Copied')
    : (copyLabel ?? translate('components.native-chat.copyMessage.copy', 'Copy message'))

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={label}
      title={label}
      className={cn(NATIVE_CHAT_ROW_ACTION_CLASS, copied && 'text-status-success', className)}
    >
      <CopyCheckIcon copied={copied} />
    </button>
  )
}
