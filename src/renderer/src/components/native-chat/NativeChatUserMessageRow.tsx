import { useMemo } from 'react'
import { Goal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import '@/components/ai/ai-motion.css'
import { translate } from '@/i18n/i18n'
import type { CommentMarkdownLinkClickHandler } from '@/components/sidebar/CommentMarkdown'
import type { RuntimeFileOperationArgs } from '@/runtime/runtime-file-client-types'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import type { NativeChatDeliveryNotice } from './NativeChatMessageRow'
import { NativeChatRewindAction } from './NativeChatRewindAction'
import { NativeChatBranchAction } from './NativeChatBranchAction'
import type { NativeChatRewindSurface } from './use-native-chat-rewind'
import { NativeChatMarkdown } from './NativeChatMarkdown'
import { NativeChatUserMessageFold } from './NativeChatUserMessageFold'
import { NativeChatCodeBlock } from './NativeChatCodeBlock'
import { NativeChatCopyButton } from './NativeChatCopyButton'
import { NativeChatMessageTimestamp } from './NativeChatMessageTimestamp'
import { NativeChatAgentMessageSenders } from './NativeChatAgentMessageSenders'
import { NativeChatImageAttachments } from './NativeChatTranscriptChrome'
import type { deriveNativeChatRowContent } from '../../../../shared/native-chat-row-content'
import { splitAsterContext } from '../../../../shared/aster-context-block'
import { NativeChatUserMessageContext } from './NativeChatUserMessageContext'
import { NATIVE_CHAT_ROW_ACTIONS_REVEAL } from './native-chat-row-action'

const USER_META_REVEAL = NATIVE_CHAT_ROW_ACTIONS_REVEAL

/** The words under a message whose delivery is not settled yet, in place of its time. */
function deliveryCaption(notice: NativeChatDeliveryNotice | undefined): string | null {
  if (notice?.queued) {
    return translate(
      'components.native-chat.messageQueuedBehindStep',
      'Queued — sends after the current step'
    )
  }
  if (notice?.confirming) {
    return translate('components.native-chat.messageConfirmingDelivery', 'Checking delivery…')
  }
  return notice?.sending ? translate('components.native-chat.messageSending', 'Sending…') : null
}

/** Under a user message: copy + timestamp, revealed together like the agent controls row. Until
 *  confirmed, a quiet "Sending…" stays visible in the time's place and copy keeps its own reveal,
 *  so the row keeps its height when it clears. Image-only prompts have no text to copy. */
function UserMessageMeta({
  markdown,
  timestamp,
  sending,
  caption,
  rewind,
  branchItemId
}: {
  markdown: string
  timestamp: number | null
  sending: boolean
  /** Stays in the time's place: "Sending…", or what the delivery is waiting on. */
  caption: string | null
  rewind?: { itemId: string; surface: NativeChatRewindSurface }
  branchItemId?: string
}): React.JSX.Element | null {
  if (!markdown && timestamp === null && !caption && !rewind && !branchItemId) {
    return null
  }
  return (
    <div
      // Hover-only once sent, so find skips it; a caption stays on screen and stays findable.
      data-native-chat-find-skip={caption ? undefined : true}
      className={cn('flex select-none items-center gap-1', !caption && USER_META_REVEAL)}
    >
      {markdown ? (
        <NativeChatCopyButton text={markdown} className={caption ? USER_META_REVEAL : undefined} />
      ) : null}
      {caption ? (
        <span className="text-xs whitespace-nowrap text-chat-foreground-faint">{caption}</span>
      ) : (
        <NativeChatMessageTimestamp timestamp={timestamp} focusable />
      )}
      {branchItemId && !sending ? (
        <NativeChatBranchAction messageId={branchItemId} kind="user" />
      ) : null}
      {rewind && !sending ? (
        <NativeChatRewindAction itemId={rewind.itemId} rewind={rewind.surface} />
      ) : null}
    </div>
  )
}

export function NativeChatUserMessageRow({
  message,
  markdown,
  prose,
  rowRef,
  onRefolded,
  onLinkClick,
  allowFileUriLinks,
  runtimeContext,
  rewind,
  branchable = false,
  deliveryNotice
}: {
  message: NativeChatMessage
  markdown: string
  prose: ReturnType<typeof deriveNativeChatRowContent>['prose']
  rowRef: React.RefObject<HTMLDivElement | null>
  onRefolded: () => void
  onLinkClick?: CommentMarkdownLinkClickHandler
  allowFileUriLinks: boolean
  runtimeContext?: RuntimeFileOperationArgs | null
  rewind?: NativeChatRewindSurface
  branchable?: boolean
  deliveryNotice?: NativeChatDeliveryNotice
}): React.JSX.Element {
  // Another agent's message is the agent's turn input too, but is not the person's: it reads
  // left-aligned under its sender rather than as their bubble.
  const from = message.from
  const sending = deliveryNotice?.sending === true
  const caption = deliveryCaption(deliveryNotice)
  // Aster's machine context folds into chips so the person's request stays the visible message.
  const split = useMemo(() => splitAsterContext(markdown), [markdown])
  const visible = split ? split.request : markdown
  return (
    <div
      ref={rowRef}
      // Read by the context menu: only rows showing the hover copy or rewind offer them there.
      data-native-chat-message-id={markdown ? message.id : undefined}
      data-native-chat-rewind-item={rewind && !sending ? message.id : undefined}
      data-native-chat-branch-item={branchable && !sending ? message.id : undefined}
      data-native-chat-branch-kind={branchable && !sending ? 'user' : undefined}
      className={cn('group relative flex flex-col gap-0.5', from ? 'items-start' : 'items-end')}
    >
      {from ? (
        <NativeChatAgentMessageSenders
          from={from}
          chatWorktreeId={runtimeContext?.worktreeId ?? null}
        />
      ) : null}
      {/* A distinct surface separates the user's prompt from the assistant's prose. */}
      <div
        className={cn(
          'max-w-[80%] text-sm',
          from
            ? 'select-text border-l border-border pl-3 text-chat-foreground'
            : 'rounded-xl border border-chat-user-border bg-chat-user-surface px-4 py-2 text-chat-foreground-strong',
          // A message just sent rises from the composer; one already in the chat stays still.
          !from && sending && 'ai-rise'
        )}
      >
        {markdown ? (
          <>
            <NativeChatImageAttachments
              blocks={prose}
              runtimeContext={runtimeContext}
              enablePreview={runtimeContext !== undefined}
            />
            {visible ? (
              <NativeChatUserMessageFold
                messageId={message.id}
                markdown={visible}
                onRefolded={onRefolded}
              >
                <NativeChatMarkdown
                  rowKey={message.id}
                  content={visible}
                  variant="document"
                  className="text-sm"
                  renderCodeBlock={NativeChatCodeBlock}
                  onLinkClick={onLinkClick}
                  allowFileUriLinks={allowFileUriLinks}
                />
              </NativeChatUserMessageFold>
            ) : null}
            {split?.contexts.map((context, index) => (
              <NativeChatUserMessageContext
                key={index}
                messageId={message.id}
                index={index}
                context={context}
              />
            ))}
          </>
        ) : (
          <NativeChatImageAttachments
            blocks={prose}
            runtimeContext={runtimeContext}
            enablePreview={runtimeContext !== undefined}
          />
        )}
      </div>
      {message.sentAs === 'goal' ? (
        <div className="flex items-center gap-1 text-xs text-chat-foreground-faint">
          <Goal className="size-4" aria-hidden />
          <span>{translate('components.native-chat.goal.sentAsGoal', 'Sent as goal')}</span>
        </div>
      ) : null}
      <UserMessageMeta
        markdown={markdown}
        timestamp={message.timestamp}
        sending={sending}
        caption={caption}
        {...(rewind ? { rewind: { itemId: message.id, surface: rewind } } : {})}
        {...(branchable ? { branchItemId: message.id } : {})}
      />
      {deliveryNotice?.text !== undefined ? (
        <div className="flex max-w-[85%] items-center gap-2 text-2xs text-destructive/80">
          <span className="min-w-0 break-words">{deliveryNotice.text}</span>
          {deliveryNotice.onDismiss ? (
            <Button type="button" variant="ghost" size="xs" onClick={deliveryNotice.onDismiss}>
              {translate('components.native-chat.dismissDeliveryNotice', 'Dismiss')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
