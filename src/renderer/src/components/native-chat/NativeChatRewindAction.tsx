import { Undo2 } from 'lucide-react'
import { useConfirmationDialog } from '@/components/confirmation-dialog-context'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { NATIVE_CHAT_ROW_ACTION_CLASS } from './native-chat-row-action'
import type { NativeChatRewindSurface } from './use-native-chat-rewind'

export function NativeChatRewindAction({
  itemId,
  rewind
}: {
  itemId: string
  rewind: NativeChatRewindSurface
}) {
  const confirm = useConfirmationDialog()
  const label = translate('components.native-chat.rewind.action', 'Rewind to here')
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* Styled like the copy button beside it in the same hover strip. */}
        <button
          type="button"
          className={NATIVE_CHAT_ROW_ACTION_CLASS}
          aria-label={label}
          aria-description={rewind.disabledReason ?? undefined}
          aria-disabled={Boolean(rewind.disabledReason)}
          onClick={() => {
            if (!rewind.disabledReason) {
              void rewind.request(itemId, confirm)
            }
          }}
        >
          <Undo2 className="size-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4} className="max-w-64">
        {rewind.disabledReason ?? (
          <>
            <span className="font-medium">{label}</span>
            {/* Said beside Branch, which makes a new chat: this one changes this chat. */}
            <span className="block text-background/70">
              {translate(
                'components.native-chat.rewind.hint',
                'Removes this message and what follows from this chat.'
              )}
            </span>
          </>
        )}
      </TooltipContent>
    </Tooltip>
  )
}
