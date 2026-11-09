import { createContext } from 'react'

/**
 * What the composer invites when it is ready to send, for a chat that does one job (the
 * Figures page asks for a figure, not files and commands). Null keeps the default hint.
 */
export const NativeChatPlaceholderContext = createContext<string | null>(null)
