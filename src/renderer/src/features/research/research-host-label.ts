import { useAppStore } from '@/store'
import { selectExecutionHostDisplayLabel } from '@/lib/execution-host-display-label'
import { parseExecutionHostId } from '../../../../shared/execution-host'

/** A remote host's human name; null on this computer, where naming the host is noise. */
export function useRemoteHostLabel(hostId: string | null | undefined): string | null {
  return useAppStore((state) => {
    const host = parseExecutionHostId(hostId)
    if (!host || host.kind === 'local') {
      return null
    }
    return selectExecutionHostDisplayLabel(state, host.id)
  })
}
