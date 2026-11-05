import type { RuntimeAiVaultHostInfo } from './ai-vault-runtime-scan'

// Per-leg bounds for the all-hosts fan-outs, so one slow host cannot hold a merge open.
export const AI_VAULT_ALL_HOST_TIMEOUT_MS = {
  runtimeScan: 3_000,
  // Why: a remote home with many agent roots routinely needs seconds to walk,
  // stat and parse. The old shared 3s bound emptied healthy SSH hosts in the
  // all-hosts view; a server reached over an SSH tunnel walks the same home
  // plus the tunnel's latency, so it gets a real scan budget.
  sshTunneledRuntimeScan: 15_000,
  // A search reads an index rather than walking a home, but it shares the
  // connection with the scans, so it gets the SSH scan budget.
  search: 15_000
} as const

// Why: opening one server's history waits on that server alone, and a large remote home (a
// hundred-plus transcripts, some tens of MB) takes longer than the 15s call default to walk.
export const AI_VAULT_SINGLE_HOST_RUNTIME_SCAN_TIMEOUT_MS = 60_000

export function allHostsRuntimeScanTimeoutMs(
  hostInfo: Pick<RuntimeAiVaultHostInfo, 'connectionDependency'>
): number {
  return hostInfo.connectionDependency === 'ssh-tunnel'
    ? AI_VAULT_ALL_HOST_TIMEOUT_MS.sshTunneledRuntimeScan
    : AI_VAULT_ALL_HOST_TIMEOUT_MS.runtimeScan
}
