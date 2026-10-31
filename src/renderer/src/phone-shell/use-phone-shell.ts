import { isCompactViewport, useCompactViewport } from '@/app-shell/use-compact-viewport'
import { isWebClientLocation } from '@/lib/web-client-location'

/**
 * The phone layout: the web client at phone width. Desktop windows narrowed below the
 * breakpoint keep the drawer layout, so the desktop app never changes shape.
 */
export function usePhoneShell(): boolean {
  return useCompactViewport() && isWebClientLocation()
}

/** The same check outside React, read when the value is applied. */
export function isPhoneShellActive(): boolean {
  // Why web client first: it guards a missing window, which the media query read does not.
  return isWebClientLocation() && isCompactViewport()
}

const PHONE_TERMINAL_FONT_SIZE = 13

/** The terminal font on a phone: the user's size, capped so a phone line holds about 50 columns. */
export function phoneTerminalFontSize(size: number): number {
  return isPhoneShellActive() ? Math.min(size, PHONE_TERMINAL_FONT_SIZE) : size
}
