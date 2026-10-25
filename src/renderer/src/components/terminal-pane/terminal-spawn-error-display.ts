import { translate } from '@/i18n/i18n'
import {
  LEGACY_PTY_ALLOCATION_HINT,
  LEGACY_TERMINAL_PROCESS_LIMIT_HINT,
  PTY_ALLOCATION_HINT,
  TERMINAL_HOST_CAP_HINT,
  TERMINAL_PROCESS_LIMIT_HINT,
  TERMINAL_SPAWN_ISSUE_REQUEST
} from '../../../../shared/terminal-spawn-error-copy'
import { PEER_PRODUCT_NAMES, PRODUCT_NAME } from '../../../../shared/product-brand'

/** Swaps the host's English resource-limit hints for the viewer's locale. */
export function localizeTerminalSpawnHints(error: string): string {
  const ptyAllocation = translate(
    'auto.components.terminal.pane.TerminalErrorToast.ptyAllocationLimit',
    PTY_ALLOCATION_HINT
  )
  const processLimit = translate(
    'auto.components.terminal.pane.TerminalErrorToast.terminalProcessLimit',
    TERMINAL_PROCESS_LIMIT_HINT
  )
  const hostCap = translate(
    'auto.components.terminal.pane.TerminalErrorToast.hostTerminalCap',
    TERMINAL_HOST_CAP_HINT
  )
  const replacements: [string, string][] = [
    [LEGACY_PTY_ALLOCATION_HINT, ptyAllocation],
    [PTY_ALLOCATION_HINT, ptyAllocation],
    [LEGACY_TERMINAL_PROCESS_LIMIT_HINT, processLimit],
    [TERMINAL_PROCESS_LIMIT_HINT, processLimit],
    [TERMINAL_HOST_CAP_HINT, hostCap]
  ]
  // Why a replacer: a translation containing `$&` would otherwise be read as a substitution.
  return replacements.reduce(
    (text, [hint, localized]) =>
      peerNamedVariants(hint).reduce(
        (current, variant) => current.replaceAll(variant, () => localized),
        text
      ),
    error
  )
}

// Why: a terminal host that kept running across the rename still publishes the upstream name.
function peerNamedVariants(hint: string): string[] {
  return [...new Set(PEER_PRODUCT_NAMES.map((name) => hint.replaceAll(PRODUCT_NAME, name)))]
}

/** Drops the host's plain-text issue request where the toast renders its own linked one. */
export function withoutTerminalSpawnIssueRequest(error: string): string {
  const suffix = ` ${TERMINAL_SPAWN_ISSUE_REQUEST}`
  return error
    .split('\n')
    .map((line) =>
      line.includes('Failed to spawn shell "') && line.endsWith(suffix)
        ? line.slice(0, -suffix.length)
        : line
    )
    .join('\n')
}
