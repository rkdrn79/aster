import { useMemo } from 'react'
import { useAppStore } from '@/store'
import {
  runtimeHostConnectionStateForEntry,
  type RuntimeHostConnectionState
} from '@/runtime/runtime-host-connection-state'
import { readStoredWebRuntimeEnvironment } from '@/web/web-runtime-environment'
import { maskEndpointSecrets } from '../../../shared/endpoint-display'

/** What the phone tells the person about its link to the host, in three words. */
export type PhoneHostConnection = 'connected' | 'reconnecting' | 'offline'

export function phoneHostConnection(state: RuntimeHostConnectionState): PhoneHostConnection {
  switch (state) {
    case 'connected':
    case 'workspace-window-closed':
      return 'connected'
    case 'checking':
    case 'reconnecting':
      return 'reconnecting'
    case 'runtime-unavailable':
    case 'disconnected':
      return 'offline'
  }
}

export function hostStateLabel(state: RuntimeHostConnectionState): string {
  switch (state) {
    case 'connected':
      return 'Connected'
    case 'workspace-window-closed':
      return 'Connected, no workspace window'
    case 'checking':
      return 'Connecting'
    case 'reconnecting':
      return 'Reconnecting'
    case 'runtime-unavailable':
      return 'Server not answering'
    case 'disconnected':
      return 'Offline'
  }
}

export type PhoneHostStatus = {
  name: string
  /** The host part of where the phone dials; a relay URL's key never reaches the screen. */
  endpoint: string | null
  state: RuntimeHostConnectionState
  connection: PhoneHostConnection
  /** The Aster version the host last answered with; null until it has. */
  appVersion: string | null
}

function endpointHost(endpoint: string): string {
  try {
    return new URL(endpoint).host || maskEndpointSecrets(endpoint)
  } catch {
    return maskEndpointSecrets(endpoint)
  }
}

/** The paired host this phone drives, named the way it was paired. */
export function usePhoneHostStatus(): PhoneHostStatus {
  const environment = useMemo(() => readStoredWebRuntimeEnvironment(), [])
  const entry = useAppStore((state) =>
    environment ? state.runtimeStatusByEnvironmentId.get(environment.id) : undefined
  )
  const endpoint = environment?.endpoints[0]?.endpoint ?? null
  // Why: the web client only renders once paired, so a missing entry means still checking.
  const state = entry ? runtimeHostConnectionStateForEntry(entry) : 'checking'
  return {
    name: environment?.name ?? 'Host',
    endpoint: endpoint ? endpointHost(endpoint) : null,
    state,
    connection: phoneHostConnection(state),
    appVersion: entry?.status?.appVersion?.trim() || entry?.appVersion?.trim() || null
  }
}
