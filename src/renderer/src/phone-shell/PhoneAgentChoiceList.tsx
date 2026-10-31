import { Check, SquareTerminal } from 'lucide-react'
import { AgentIcon } from '@/lib/agent-catalog'
import type { NewTabAgentMenuModel } from '@/components/tab-bar/use-new-tab-agent-menu-rows'
import {
  chatUnavailableLabel,
  rowId,
  rowLabel
} from '@/components/tab-bar/tab-agent-row-presentation'
import { PhoneRow, PhoneSection, PhoneSectionNote } from './PhoneListLayout'

/** The plain-shell choice, which needs no agent on the host. */
export const PHONE_TERMINAL_CHOICE = 'terminal-shell'

const CHECK = <Check className="size-5 text-foreground" aria-hidden />

/**
 * The agents the host can start here, as the desktop's quick-launch menu lists them: chats,
 * terminal launches, chats the host cannot open (with the reason), then a plain shell.
 */
export function PhoneAgentChoiceList({
  menu,
  selected,
  onSelect
}: {
  menu: NewTabAgentMenuModel | null
  selected: string
  onSelect: (key: string) => void
}): React.JSX.Element {
  const rows = menu?.state === 'settled' ? menu.rows : []
  const launchable = rows.filter((row) => row.kind !== 'chat-unavailable')
  return (
    <PhoneSection label="Agent">
      {!menu || menu.state === 'loading' ? (
        <PhoneSectionNote>Checking which agents this host can run…</PhoneSectionNote>
      ) : launchable.length === 0 ? (
        <PhoneSectionNote>
          No agents found on this host. Install Claude Code or Codex there to start one.
        </PhoneSectionNote>
      ) : null}
      {rows.map((row) => {
        const key = rowId(row)
        const unavailable = row.kind === 'chat-unavailable'
        return (
          <PhoneRow
            key={key}
            data-phone-agent-choice={key}
            leading={<AgentIcon agent={row.agent} size={18} />}
            title={rowLabel(row)}
            subtitle={
              unavailable
                ? `Chat: ${chatUnavailableLabel(row.reason)}`
                : row.kind === 'chat'
                  ? 'Chat in Aster'
                  : 'Runs in a terminal'
            }
            trailing={selected === key ? CHECK : null}
            onClick={unavailable ? undefined : () => onSelect(key)}
          />
        )
      })}
      <PhoneRow
        data-phone-agent-choice={PHONE_TERMINAL_CHOICE}
        leading={<SquareTerminal className="size-[18px]" aria-hidden />}
        title="Terminal"
        subtitle="A plain shell, no agent"
        trailing={selected === PHONE_TERMINAL_CHOICE ? CHECK : null}
        onClick={() => onSelect(PHONE_TERMINAL_CHOICE)}
      />
    </PhoneSection>
  )
}
