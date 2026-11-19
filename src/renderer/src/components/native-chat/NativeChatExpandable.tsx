import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible'

/** Shows its content in place and fades it in; height never animates. Children mount only
 *  while open, so open-only work belongs in a child component. */
export function NativeChatExpandable({
  open,
  children
}: {
  open: boolean
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <Collapsible open={open}>
      <CollapsibleContent data-native-chat-reveal="" data-native-chat-member-detail>
        {children}
      </CollapsibleContent>
    </Collapsible>
  )
}
