import { create } from 'zustand'
import { COMPACT_VIEWPORT_QUERY } from '@/app-shell/compact-viewport-query'

/** Chrome's deferred install prompt, once the page qualifies; null elsewhere or after use. */
export const useWebInstallPrompt = create<{ prompt: (() => Promise<void>) | null }>(() => ({
  prompt: null
}))

/**
 * Holds Chrome's `beforeinstallprompt` for an Install button. Called from the web entry because
 * the event fires once, soon after load, before the app has mounted.
 */
export function captureWebInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (event) => {
    const prompt: unknown = Reflect.get(event, 'prompt')
    if (typeof prompt !== 'function') {
      return
    }
    // Why phones only: there the card offers Install, so Chrome's own mini-infobar would repeat it.
    if (!window.matchMedia?.(COMPACT_VIEWPORT_QUERY).matches) {
      return
    }
    event.preventDefault()
    useWebInstallPrompt.setState({
      prompt: async () => {
        useWebInstallPrompt.setState({ prompt: null })
        await Reflect.apply(prompt, event, [])
      }
    })
  })
  window.addEventListener('appinstalled', () => useWebInstallPrompt.setState({ prompt: null }))
}

/** Whether this page runs as an installed Home Screen app rather than in a browser tab. */
export function isStandaloneDisplayMode(): boolean {
  if (typeof window === 'undefined') {
    return false
  }
  // Why navigator.standalone: iOS before 16.4 reports only this, never the media query.
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    Reflect.get(window.navigator, 'standalone') === true
  )
}

/** A Home Screen app at phone width; installed desktop windows keep the desktop copy. */
export function isPhoneHomeScreenApp(): boolean {
  return isStandaloneDisplayMode() && window.matchMedia?.(COMPACT_VIEWPORT_QUERY).matches === true
}
