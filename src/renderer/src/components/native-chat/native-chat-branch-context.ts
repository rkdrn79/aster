import { createContext } from 'react'

/** What a structured chat offers its rows, menus and composer for branching: a new chat holding
 *  this one's conversation up to a message, while this one stays as it is. */
export type NativeChatBranchSurface = {
  /** Why nothing can branch now, in one line; null when it can. */
  disabledReason: string | null
  /** Why a message other than the latest can't start a branch; null when any can. */
  earlierDisabledReason: string | null
  /** The person's messages a branch can start at: each opened its own turn. */
  openerIds: ReadonlySet<string>
  /** Whether a branch from this message keeps the whole finished conversation. */
  isLatest: (messageId: string) => boolean
  /** A new chat up to this message: an agent's reply, or the person's message asked again. */
  branchFrom: (messageId: string) => void
  /** A new chat up to the person's message, with that message back in its composer. */
  editAndBranch: (messageId: string) => void
  /** A new chat with the whole conversation, from its latest finished message. */
  branchChat: () => void
}

export const NativeChatBranchContext = createContext<NativeChatBranchSurface | undefined>(undefined)

/** How the surface showing a chat opens another chat of its family: a research pane binds it, a
 *  Chats list selects it. `switcher`: the surface lists the family itself. */
export type NativeChatBranchNavigation = {
  open: (sessionId: string) => void
  switcher?: boolean
}

export const NativeChatBranchNavigationContext = createContext<NativeChatBranchNavigation | null>(
  null
)

/** Why a row's branch action is unavailable; null when it can run. */
export function nativeChatBranchRowBlock(
  branch: NativeChatBranchSurface,
  messageId: string
): string | null {
  return (
    branch.disabledReason ??
    (branch.earlierDisabledReason && !branch.isLatest(messageId)
      ? branch.earlierDisabledReason
      : null)
  )
}
