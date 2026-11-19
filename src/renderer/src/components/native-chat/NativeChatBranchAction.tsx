import { useContext } from 'react'
import { GitBranch, GitFork, PencilLine, Split } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { NativeChatBranchContext, nativeChatBranchRowBlock } from './native-chat-branch-context'
import { NATIVE_CHAT_ROW_ACTION_CLASS } from './native-chat-row-action'

// Styled like the copy and rewind buttons beside it in the same hover strip.
const BUTTON_CLASS = NATIVE_CHAT_ROW_ACTION_CLASS

/** One line each, so Branch (switch to a copy), Fork (a copy in the background) and Rewind
 *  (change this chat) never read alike. */
export function nativeChatBranchLabels() {
  return {
    branchFromHere: translate('components.native-chat.branch.fromHere', 'Branch from here'),
    forkFromHere: translate('components.native-chat.branch.forkFromHere', 'Fork from here'),
    editAndBranch: translate('components.native-chat.branch.editAndBranch', 'Edit and branch'),
    branchChat: translate('components.native-chat.branch.chat', 'Branch chat'),
    forkChat: translate('components.native-chat.branch.forkChat', 'Fork to background'),
    menu: translate('components.native-chat.branch.menu', 'Branch or fork'),
    branchHint: translate(
      'components.native-chat.branch.agentHint',
      'A new chat up to this reply, and you switch to it. This chat stays.'
    ),
    forkHint: translate(
      'components.native-chat.branch.forkHint',
      'The same copy, left in the background while you stay here.'
    ),
    askAgainHint: translate(
      'components.native-chat.branch.askAgainHint',
      'A new chat up to here that asks this again, and you switch to it.'
    ),
    forkAskAgainHint: translate(
      'components.native-chat.branch.forkAskAgainHint',
      'Asks this again in a background copy while you stay here.'
    ),
    editHint: translate(
      'components.native-chat.branch.editHint',
      'A new chat up to here, with this message ready to change.'
    ),
    branchChatHint: translate(
      'components.native-chat.branch.chatHint',
      'A new chat with this conversation, and you switch to it.'
    ),
    forkChatHint: translate(
      'components.native-chat.branch.forkChatHint',
      'A copy that keeps working while you stay here.'
    )
  }
}

/** The quiet hover action on a message: a small menu to branch there (switch to the copy) or fork
 *  there (leave it in the background), and on the person's own message, to edit and branch. Shown
 *  disabled with its reason when it can't run. */
export function NativeChatBranchAction({
  messageId,
  kind
}: {
  messageId: string
  kind: 'user' | 'agent'
}): React.JSX.Element | null {
  const branch = useContext(NativeChatBranchContext)
  if (!branch) {
    return null
  }
  const labels = nativeChatBranchLabels()
  const block = nativeChatBranchRowBlock(branch, messageId)
  if (block) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={BUTTON_CLASS}
            aria-label={labels.menu}
            aria-description={block}
            aria-disabled
            data-native-chat-branch-action={kind}
          >
            <GitBranch className="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={4} className="max-w-64">
          {block}
        </TooltipContent>
      </Tooltip>
    )
  }
  return (
    <DropdownMenu modal={false}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={BUTTON_CLASS}
              aria-label={labels.menu}
              data-native-chat-branch-action={kind}
            >
              <GitBranch className="size-4" />
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={4}>
          {labels.menu}
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent data-native-chat-surface="" align="end" className="w-72">
        <NativeChatBranchRows messageId={messageId} kind={kind} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The rows for one message, shared by its hover menu and the chat's right-click menu. */
export function NativeChatBranchRows({
  messageId,
  kind,
  disabledReason = null
}: {
  messageId: string
  kind: 'user' | 'agent'
  disabledReason?: string | null
}): React.JSX.Element | null {
  const branch = useContext(NativeChatBranchContext)
  if (!branch) {
    return null
  }
  const labels = nativeChatBranchLabels()
  const user = kind === 'user'
  return (
    <>
      {user ? (
        <NativeChatBranchMenuRow
          icon={<PencilLine />}
          label={labels.editAndBranch}
          hint={labels.editHint}
          disabledReason={disabledReason}
          onSelect={() => branch.editAndBranch(messageId)}
        />
      ) : null}
      <NativeChatBranchMenuRow
        icon={user ? <Split /> : <GitBranch />}
        label={labels.branchFromHere}
        hint={user ? labels.askAgainHint : labels.branchHint}
        disabledReason={disabledReason}
        onSelect={() => branch.branchFrom(messageId)}
      />
      <NativeChatBranchMenuRow
        icon={<GitFork />}
        label={labels.forkFromHere}
        hint={user ? labels.forkAskAgainHint : labels.forkHint}
        disabledReason={disabledReason}
        onSelect={() => branch.forkFrom(messageId)}
      />
    </>
  )
}

/** A copy row with its one-line meaning, or its reason when it can't run. */
export function NativeChatBranchMenuRow({
  icon,
  label,
  hint,
  disabledReason = null,
  onSelect
}: {
  icon: React.ReactNode
  label: string
  hint?: string
  disabledReason?: string | null
  onSelect: () => void
}): React.JSX.Element {
  const detail = disabledReason ?? hint
  return (
    <DropdownMenuItem disabled={Boolean(disabledReason)} onSelect={onSelect}>
      {icon}
      <span className="grid min-w-0">
        {label}
        {detail ? (
          <span className="text-xs whitespace-normal text-muted-foreground">{detail}</span>
        ) : null}
      </span>
    </DropdownMenuItem>
  )
}
