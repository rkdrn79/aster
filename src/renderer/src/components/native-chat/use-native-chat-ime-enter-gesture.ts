import { useRef } from 'react'
import { useImeEnterGestureOwnership } from '@/lib/ime-composition-keyboard-event'

/**
 * The composer's IME Enter owner. A Hangul Enter whose platform sends no redispatch submits
 * through the send the composer registers once it has built one.
 */
export function useNativeChatImeEnterGesture(): {
  imeEnterGesture: ReturnType<typeof useImeEnterGestureOwnership>
  submitHangulEnterWith: (submit: () => void) => void
} {
  const submitRef = useRef<() => void>(() => {})
  const imeEnterGesture = useImeEnterGestureOwnership({
    onHangulEnter: () => submitRef.current()
  })
  return {
    imeEnterGesture,
    submitHangulEnterWith: (submit) => {
      submitRef.current = submit
    }
  }
}
