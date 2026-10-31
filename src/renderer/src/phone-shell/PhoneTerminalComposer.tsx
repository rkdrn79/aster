import { useState } from 'react'
import { ArrowDown, ArrowUp, CornerDownLeft, SendHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { useShallow } from 'zustand/react/shallow'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import { makePaneKey } from '../../../shared/stable-pane-id'
import { sendPhoneTerminalInput, type PhoneTerminalInput } from './phone-terminal-input'

type ActiveTerminalPane = { worktreeId: string; tabId: string; leafId: string; isAgent: boolean }

/** The focused terminal pane the composer types into; null for chats, editors and browsers. */
function selectActiveTerminalPane(state: AppState): ActiveTerminalPane | null {
  const worktreeId = state.activeWorktreeId
  const tabId = state.activeTabId
  if (!worktreeId || !tabId || state.activeTabType !== 'terminal') {
    return null
  }
  const tab = state.unifiedTabsByWorktree[worktreeId]?.find(
    (candidate) => candidate.entityId === tabId || candidate.id === tabId
  )
  // Why: chat view brings its own composer.
  const leafId = state.terminalLayoutsByTabId[tabId]?.activeLeafId
  if (tab?.viewMode === 'chat' || !leafId) {
    return null
  }
  return {
    worktreeId,
    tabId,
    leafId,
    isAgent: Boolean(state.agentStatusByPaneKey[makePaneKey(tabId, leafId)])
  }
}

const QUICK_KEYS: { label: React.ReactNode; name: string; input: PhoneTerminalInput }[] = [
  { label: 'Esc', name: 'Escape', input: { text: '\x1b' } },
  { label: 'Tab', name: 'Tab', input: { text: '\t' } },
  { label: <ArrowUp className="size-4" aria-hidden />, name: 'Up', input: { text: '\x1b[A' } },
  { label: <ArrowDown className="size-4" aria-hidden />, name: 'Down', input: { text: '\x1b[B' } },
  { label: '⌃C', name: 'Interrupt', input: { interrupt: true } },
  {
    label: <CornerDownLeft className="size-4" aria-hidden />,
    name: 'Enter',
    input: { enter: true }
  }
]

/**
 * A sticky input under a full-screen terminal. Agents and shells on a phone need keys an iOS
 * keyboard lacks, and a line editor that does not fight autocorrect inside xterm.
 */
export function PhoneTerminalComposer(): React.JSX.Element | null {
  const pane = useAppStore(useShallow(selectActiveTerminalPane))
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  if (!pane) {
    return null
  }

  const send = async (input: PhoneTerminalInput): Promise<boolean> => {
    setSending(true)
    try {
      const accepted = await sendPhoneTerminalInput({ ...pane, input, agentPrompt: pane.isAgent })
      if (!accepted) {
        toast.error('The terminal did not take the input. Another device may be typing in it.')
      }
      return accepted
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not reach the terminal.')
      return false
    } finally {
      setSending(false)
    }
  }
  const submit = async (): Promise<void> => {
    const text = draft
    if (await send(text ? { text, enter: true } : { enter: true })) {
      setDraft('')
    }
  }

  return (
    <div
      className="shrink-0 space-y-2.5 border-t border-border bg-background px-4 pt-2.5 pb-[max(env(safe-area-inset-bottom),0.625rem)]"
      data-phone-terminal-composer=""
    >
      <div className="scrollbar-sleek flex gap-2 overflow-x-auto" role="toolbar">
        {QUICK_KEYS.map((key) => (
          <button
            key={key.name}
            type="button"
            aria-label={key.name}
            disabled={sending}
            onClick={() => void send(key.input)}
            className="flex h-9 min-w-12 shrink-0 items-center justify-center rounded-full bg-secondary px-3.5 text-[13px] font-medium text-secondary-foreground active:bg-accent disabled:opacity-50"
          >
            {key.label}
          </button>
        ))}
      </div>
      <div className="flex items-end gap-2">
        <Textarea
          value={draft}
          rows={1}
          placeholder={pane.isAgent ? 'Message the agent' : 'Type a command'}
          aria-label={pane.isAgent ? 'Message the agent' : 'Type a command'}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="send"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              void submit()
            }
          }}
          className="max-h-32 min-h-10 flex-1"
        />
        <Button size="icon-lg" aria-label="Send" disabled={sending} onClick={() => void submit()}>
          <SendHorizontal aria-hidden />
        </Button>
      </div>
    </div>
  )
}
