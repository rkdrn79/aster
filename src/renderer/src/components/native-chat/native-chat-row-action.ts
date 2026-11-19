/** The quiet icon buttons that appear on a message under the pointer (copy, scroll to top, branch,
 *  rewind): a soft highlight on hover, a small press, and the open menu's trigger held lit. */
export const NATIVE_CHAT_ROW_ACTION_CLASS =
  'press-scale flex size-6 shrink-0 items-center justify-center rounded-md text-chat-foreground-faint hover:bg-highlight hover:text-chat-foreground-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-disabled:opacity-50 data-[state=open]:bg-highlight data-[state=open]:text-chat-foreground-strong'

/** A message's hover strip: hidden until the row is hovered or holds keyboard focus, then it fades
 *  in and settles up 2px (`.native-chat-row-actions` in native-chat-appearance.css). Touch screens
 *  (no hover) always show it; the settle is dropped under reduced motion. */
export const NATIVE_CHAT_ROW_ACTIONS_REVEAL =
  'native-chat-row-actions transition-[opacity,translate] duration-(--duration-fast) ease-out-quint can-hover:pointer-events-none can-hover:opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 [.group:has(:focus-visible)_&]:pointer-events-auto [.group:has(:focus-visible)_&]:opacity-100'
