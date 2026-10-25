import { useId } from 'react'
import { ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type { AsterContext } from '../../../../shared/aster-context-block'
import { useNativeChatDisclosure } from './native-chat-disclosure-store'
import { NativeChatExpandable } from './NativeChatExpandable'

/** Aster's machine context under a user request: a folded chip the reader can open. */
export function NativeChatUserMessageContext({
  messageId,
  index,
  context
}: {
  messageId: string
  index: number
  context: AsterContext
}): React.JSX.Element {
  const disclosure = useNativeChatDisclosure(`user-message-context:${messageId}:${index}`, false)
  const bodyId = useId()
  const lines = context.body ? context.body.split('\n').length : 0
  const label = context.label || translate('components.native-chat.userMessage.context', 'Aster')
  return (
    <div className="mt-1.5 min-w-0 select-none" data-native-chat-user-message-context="">
      <Button
        type="button"
        variant="ghost"
        size="xs"
        aria-expanded={disclosure.open}
        aria-controls={bodyId}
        title={context.label || undefined}
        // Why: the bubble sizes to the chip minus its hanging margin, so the cap gives that margin back.
        className="-ml-1.5 max-w-[calc(100%+--spacing(1.5))] justify-start"
        onClick={() => disclosure.setOpen(!disclosure.open)}
      >
        <ChevronRight
          className={cn('size-3 transition-transform', disclosure.open && 'rotate-90')}
          aria-hidden
        />
        <span className="min-w-0 truncate text-chat-foreground-faint">
          {translate('components.native-chat.userMessage.contextLabel', 'Context: {{label}}', {
            label
          })}
        </span>
        <span className="shrink-0 tabular-nums text-chat-foreground-faint">
          ·{' '}
          {lines === 1
            ? translate('components.native-chat.userMessage.contextLine', '1 line')
            : translate('components.native-chat.userMessage.contextLines', '{{count}} lines', {
                count: lines
              })}
        </span>
      </Button>
      <NativeChatExpandable open={disclosure.open}>
        <pre
          id={bodyId}
          className="scrollbar-sleek mt-1 max-h-72 overflow-auto rounded-md border border-border/60 bg-muted/40 p-2 font-mono text-xs whitespace-pre-wrap break-words text-chat-foreground select-text"
        >
          {context.body}
        </pre>
      </NativeChatExpandable>
    </div>
  )
}
