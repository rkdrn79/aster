import { createContext } from 'react'
import type { ConfirmationDialogContextValue } from '@/components/confirmation-dialog-context'

/** What a structured chat offers its rows, menus and composer for copying itself. A branch is a
 *  new chat you switch to; a fork is one left working in the background while you stay; a subtask
 *  works on one task on a hidden copy and reports back here. This chat never changes. */
export type NativeChatBranchSurface = {
  /** Why nothing can be copied now, in one line; null when it can. */
  disabledReason: string | null
  /** Why a message other than the latest can't start a copy; null when any can. */
  earlierDisabledReason: string | null
  /** The person's messages a copy can start at: each opened its own turn. */
  openerIds: ReadonlySet<string>
  /** Whether a copy from this message keeps the whole finished conversation. */
  isLatest: (messageId: string) => boolean
  /** Branch from here: up to this message (an agent's reply, or the person's asked again). */
  branchFrom: (messageId: string) => void
  /** Fork from here: the same copy, left working in the background. */
  forkFrom: (messageId: string) => void
  /** A new chat up to the person's message, with that message back in its composer. */
  editAndBranch: (messageId: string) => void
  /** Branch chat (`/branch [name]`): the whole conversation, switched to. */
  branchChat: (name?: string) => void
  /** Fork to background (`/fork [prompt]`): the whole conversation, working on `prompt` if given. */
  forkChat: (prompt?: string) => void
  /** `/subtask <task>`: a hidden copy works on `task`; its result comes back to this chat. */
  subtask: (task: string) => void
  /** `/rewind`: back to the person's latest message, as its Rewind to here; null when the chat
   *  can't go back. */
  rewindLatest: ((confirm: ConfirmationDialogContextValue) => void) | null
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
