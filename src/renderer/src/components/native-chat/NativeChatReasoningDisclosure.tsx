import { ChevronRight } from 'lucide-react'
import type { CommentMarkdownLinkClickHandler } from '@/components/sidebar/CommentMarkdown'
import { NativeChatCodeBlock } from './NativeChatCodeBlock'
import { NativeChatMarkdown } from './NativeChatMarkdown'

/** A reasoning block's text, under the live activity line or its finished row: quieter prose in the
 *  transcript's own type. Capped and scrollable, so an expanded block streaming at the tail cannot
 *  grow without bound. */
export function NativeChatReasoningBody({
  markdown,
  onLinkClick,
  allowFileUriLinks,
  rowKey,
  streaming = false
}: {
  markdown: string
  /** The reasoning block's disclosure key, shared by its live line and finished row. */
  rowKey?: string
  onLinkClick?: CommentMarkdownLinkClickHandler
  allowFileUriLinks?: boolean
  /** The block is still arriving under the live activity line. */
  streaming?: boolean
}): React.JSX.Element {
  return (
    <div
      data-native-chat-message-tone="faint"
      className="scrollbar-sleek mt-1 ml-1.75 max-h-80 overflow-y-auto border-l border-chat-code-border pl-4 text-chat-foreground-faint"
    >
      <NativeChatMarkdown
        rowKey={rowKey}
        content={markdown}
        variant="document"
        className="text-sm"
        renderCodeBlock={NativeChatCodeBlock}
        onLinkClick={onLinkClick}
        allowFileUriLinks={allowFileUriLinks}
        linkifyFilePaths={onLinkClick !== undefined}
        streaming={streaming}
        math
      />
    </div>
  )
}

/** The disclosure caret of a `group/reasoning` header: shown on hover, keyboard focus (on the
 *  header or a trigger inside it) and touch, and turned while open. */
export function NativeChatReasoningChevron(): React.JSX.Element {
  return (
    <ChevronRight
      aria-hidden
      className="size-4 shrink-0 text-chat-foreground-faint transition-[opacity,rotate] can-hover:opacity-0 group-hover/reasoning:opacity-100 group-focus-visible/reasoning:opacity-100 group-has-[:focus-visible]/reasoning:opacity-100 group-data-[state=open]/reasoning:rotate-90 group-data-[state=open]/reasoning:opacity-100 motion-reduce:transition-none"
    />
  )
}
