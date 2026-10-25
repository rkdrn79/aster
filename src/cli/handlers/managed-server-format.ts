import type { OrcadManagedRuntimeStatus } from '../../shared/orcad-managed-runtime'
import { CLI_NAME } from '../../shared/product-brand'

function count(value: number | null): string {
  return value === null ? 'unverifiable' : String(value)
}

export function formatManagedServerStatus(status: OrcadManagedRuntimeStatus): string {
  const lines = [
    `Active version: ${status.activeVersion ?? 'none'}`,
    `Previous version: ${status.previousVersion ?? 'none'}${status.rollbackAvailable ? ' (rollback available)' : ''}`,
    `Live terminals: ${count(status.terminals.liveSessions)}`
  ]
  if (status.recovery) {
    lines.push(
      `Interrupted ${status.recovery.operation} of ${status.recovery.version} (${status.recovery.phase}); run \`${CLI_NAME} environment recover\`.`
    )
  }
  if (status.migration) {
    lines.push(`Migration into this server: ${status.migration.phase}`)
  }
  if (status.deferredUpdate) {
    lines.push(
      `Deferred update to ${status.deferredUpdate.candidateVersion}: ${status.deferredUpdate.reason}`
    )
  }
  return lines.join('\n')
}
