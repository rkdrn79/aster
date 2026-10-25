import type { ComputerActionResult } from '../shared/runtime-types'
import { CLI_NAME } from '../shared/product-brand'
import { quoteCliCommandArgument } from './shell-command-quote'

export type ComputerActionFollowUpTarget = {
  session?: string
  worktree?: string
  windowId?: number
  windowIndex?: number
  restoreWindow?: boolean
}

/** The exact command an agent runs to re-read the window an action touched. */
export function formatComputerFollowUpCommand(
  result: ComputerActionResult,
  target: ComputerActionFollowUpTarget
): string {
  const args = [
    CLI_NAME,
    'computer',
    'get-app-state',
    '--app',
    quoteCliCommandArgument(result.snapshot.app.bundleId ?? result.snapshot.app.name)
  ]
  if (target.session) {
    args.push('--session', quoteCliCommandArgument(target.session))
  } else if (target.worktree) {
    args.push('--worktree', quoteCliCommandArgument(target.worktree))
  }
  const windowChanged =
    result.action?.verification?.state === 'unverified' &&
    result.action.verification.reason === 'window_changed'
  if (!windowChanged && target.windowId !== undefined) {
    args.push('--window-id', String(target.windowId))
  } else if (!windowChanged && target.windowIndex !== undefined) {
    args.push('--window-index', String(target.windowIndex))
  } else {
    const windowId = result.action?.targetWindowId ?? result.snapshot.window.id
    const windowIndex = result.action?.targetWindowIndex ?? result.snapshot.window.index
    if (windowId !== null && windowId !== undefined) {
      args.push('--window-id', String(windowId))
    } else if (windowIndex !== null && windowIndex !== undefined) {
      args.push('--window-index', String(windowIndex))
    }
  }
  if (target.restoreWindow) {
    args.push('--restore-window')
  }
  return args.join(' ')
}
