import { Undo2 } from 'lucide-react'
import { useConfirmationDialog } from '@/components/confirmation-dialog-context'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
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
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-chat-foreground-faint transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-disabled:opacity-50"
          aria-label={label}
          aria-description={rewind.disabledReason ?? undefined}
          aria-disabled={Boolean(rewind.disabledReason)}
          onClick={() => {
            if (!rewind.disabledReason) {
              void rewind.request(itemId, confirm)
            }
          }}
        >
          <Undo2 className="size-3.5" />
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
