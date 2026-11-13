import { useContext } from 'react'
import { GitBranch, PencilLine, Split } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { NativeChatBranchContext, nativeChatBranchRowBlock } from './native-chat-branch-context'

// Styled like the copy and rewind buttons beside it in the same hover strip.
const BUTTON_CLASS =
  'flex size-6 shrink-0 items-center justify-center rounded-md text-chat-foreground-faint transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-disabled:opacity-50 data-[state=open]:bg-accent data-[state=open]:text-accent-foreground'

export function nativeChatBranchLabels() {
  return {
    branchFromHere: translate('components.native-chat.branch.fromHere', 'Branch from here'),
    editAndBranch: translate('components.native-chat.branch.editAndBranch', 'Edit and branch'),
    branchChat: translate('components.native-chat.branch.chat', 'Branch chat'),
    agentHint: translate(
      'components.native-chat.branch.agentHint',
      'New chat with everything up to this reply. This chat stays as it is.'
    ),
    askAgainHint: translate(
      'components.native-chat.branch.askAgainHint',
      'New chat up to here that asks this again.'
    ),
    editHint: translate(
      'components.native-chat.branch.editHint',
      'New chat up to here, with this message ready to change.'
    )
  }
}

/** The quiet hover action that branches at one message: one click on the agent's reply, a small
 *  menu on the person's own (edit it, or ask it again). Shown disabled with its reason. */
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
  if (kind === 'agent' || block) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={BUTTON_CLASS}
            aria-label={labels.branchFromHere}
            aria-description={block ?? labels.agentHint}
            aria-disabled={Boolean(block)}
            data-native-chat-branch-action={kind}
            onClick={() => {
              if (!block) {
                branch.branchFrom(messageId)
              }
            }}
          >
            <GitBranch className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={4} className="max-w-64">
          {block ?? (
            <>
              <span className="font-medium">{labels.branchFromHere}</span>
              <span className="block text-background/70">{labels.agentHint}</span>
            </>
          )}
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
              aria-label={translate('components.native-chat.branch.menu', 'Branch')}
              data-native-chat-branch-action={kind}
            >
              <GitBranch className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={4}>
          {translate('components.native-chat.branch.menuHint', 'Branch into a new chat')}
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-64">
        <NativeChatBranchMenuRow
          icon={<PencilLine />}
          label={labels.editAndBranch}
          hint={labels.editHint}
          onSelect={() => branch.editAndBranch(messageId)}
        />
        <NativeChatBranchMenuRow
          icon={<Split />}
          label={labels.branchFromHere}
          hint={labels.askAgainHint}
          onSelect={() => branch.branchFrom(messageId)}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** A branch row with its one-line meaning, or its reason when it can't run. */
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
