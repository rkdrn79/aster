import { z } from 'zod'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { makePaneKey } from '../../../shared/stable-pane-id'
import {
  HOST_TERMINAL_SURFACE_SEPARATOR,
  toHostSessionTabId
} from '../../../shared/terminal-surface-id'

/** The host's own tab id for a tab this client mirrors as `web-terminal-<host surface>`. */
function hostTabId(tabId: string): string {
  return toHostSessionTabId(tabId).split(HOST_TERMINAL_SURFACE_SEPARATOR)[0] ?? tabId
}

export type PhoneTerminalInput = { text?: string; enter?: boolean; interrupt?: boolean }

const resolvePaneSchema = z.object({ terminal: z.object({ handle: z.string().min(1) }) })
const sendSchema = z.object({ send: z.object({ accepted: z.boolean() }) })

/**
 * Types into a host terminal through `terminal.send`, the path the CLI and phone apps use.
 * Why not xterm's own input: iOS keyboards cannot send Esc, Tab, arrows or Ctrl-C there.
 */
export async function sendPhoneTerminalInput(args: {
  worktreeId: string
  tabId: string
  leafId: string
  input: PhoneTerminalInput
  /** Agents take a prompt as one submitted message rather than raw keystrokes. */
  agentPrompt: boolean
}): Promise<boolean> {
  // Why local: in the web client the local target is the paired host.
  const resolved = resolvePaneSchema.parse(
    await callRuntimeRpc({ kind: 'local' }, 'terminal.resolvePane', {
      paneKey: makePaneKey(hostTabId(args.tabId), args.leafId),
      worktreeId: args.worktreeId
    })
  )
  const response = sendSchema.parse(
    await callRuntimeRpc({ kind: 'local' }, 'terminal.send', {
      terminal: resolved.terminal.handle,
      ...(args.input.text ? { text: args.input.text } : {}),
      ...(args.input.enter ? { enter: true } : {}),
      ...(args.input.interrupt ? { interrupt: true } : {}),
      ...(args.agentPrompt && args.input.text && args.input.enter ? { agentPrompt: true } : {})
    })
  )
  return response.send.accepted
}
