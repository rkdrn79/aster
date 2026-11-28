/** Managed orcad servers over SSH; desktop-only, so web clients leave it undefined. */
import { ipcRenderer } from 'electron'
import type {
  OrcadDeltaMovePreview,
  OrcadDeltaMoveResult,
  OrcadManagedCancelStopResult,
  OrcadManagedConversionResult,
  OrcadManagedDeployResult,
  OrcadManagedForgetResult,
  OrcadManagedPendingMigrationRow,
  OrcadManagedRecoveryResult,
  OrcadManagedRestartResult,
  OrcadManagedRollbackResult,
  OrcadManagedRuntimeStatus,
  OrcadManagedStopResult
} from '../../shared/orcad-managed-runtime'
import type { PublicKnownRuntimeEnvironment } from '../../shared/runtime-environments'
import type {
  ServerAutoUpdateHostStatus,
  ServerAutoUpdateMode,
  ServerAutoUpdateNowResult
} from '../../shared/server-auto-update'
import { SERVER_AUTO_UPDATE_CHANGED_CHANNEL } from '../../shared/server-auto-update-channels'
import type {
  RuntimeSshAccessLinkRequest,
  RuntimeSshAccessUnlinkRequest
} from '../../shared/runtime-ssh-access'

export type ManagedOrcadPreloadApi = {
  deploy: (args: {
    name: string
    sshTargetId: string
    force?: boolean
  }) => Promise<OrcadManagedDeployResult>
  getStatus: (args: { selector: string }) => Promise<OrcadManagedRuntimeStatus>
  update: (args: { selector: string; force?: boolean }) => Promise<OrcadManagedDeployResult>
  rollback: (args: { selector: string }) => Promise<OrcadManagedRollbackResult>
  recover: (args: {
    selector: string
    /** Restore the snapshot over state a rejected build changed; see ORCAD_RECOVERY_CHANGED_STATE_CODE. */
    acceptChangedState?: boolean
  }) => Promise<OrcadManagedRecoveryResult>
  /** Restarts from this client's SSH session; refused while terminals run. */
  restart: (args: { selector: string }) => Promise<OrcadManagedRestartResult>
  stop: (args: { selector: string }) => Promise<OrcadManagedStopResult>
  cancelStop: (args: { selector: string }) => Promise<OrcadManagedCancelStopResult>
  forget: (args: { selector: string }) => Promise<OrcadManagedForgetResult>
  linkSshAccess: (args: RuntimeSshAccessLinkRequest) => Promise<PublicKnownRuntimeEnvironment>
  unlinkSshAccess: (args: RuntimeSshAccessUnlinkRequest) => Promise<PublicKnownRuntimeEnvironment>
  convertSshHost: (args: {
    sshTargetId: string
    name: string
  }) => Promise<OrcadManagedConversionResult>
  listPendingMigrations: () => Promise<OrcadManagedPendingMigrationRow[]>
  previewDeltaMove: (args: { sshTargetId: string }) => Promise<OrcadDeltaMovePreview>
  moveDelta: (args: { sshTargetId: string }) => Promise<OrcadDeltaMoveResult>
  keepServerVersion: (args: { sshTargetId: string }) => Promise<void>
  /** "Move anyway": the next connect leaves what can't move on this desktop. */
  allowMoveLeavingBehind: (args: { sshTargetId: string }) => Promise<void>
  /** Each managed server's automatic-update state, as the desktop last saw it. */
  autoUpdateStatus: () => Promise<ServerAutoUpdateHostStatus[]>
  /** Updates now even while agents work; the chats an update cuts are continued after it. */
  autoUpdateNow: (args: { selector: string }) => Promise<ServerAutoUpdateNowResult>
  onAutoUpdateChanged: (callback: (statuses: ServerAutoUpdateHostStatus[]) => void) => () => void
  /** This host's own choice; null follows the global "Update servers automatically" setting. */
  setAutoUpdateMode: (args: {
    sshTargetId: string
    mode: ServerAutoUpdateMode | null
  }) => Promise<void>
}

export const managedOrcadApi: ManagedOrcadPreloadApi = {
  deploy: (args) => ipcRenderer.invoke('runtimeEnvironments:deployOrcad', args),
  getStatus: (args) => ipcRenderer.invoke('runtimeEnvironments:getOrcadStatus', args),
  update: (args) => ipcRenderer.invoke('runtimeEnvironments:updateOrcad', args),
  rollback: (args) => ipcRenderer.invoke('runtimeEnvironments:rollbackOrcad', args),
  recover: (args) => ipcRenderer.invoke('runtimeEnvironments:recoverOrcad', args),
  restart: (args) => ipcRenderer.invoke('runtimeEnvironments:restartOrcad', args),
  stop: (args) => ipcRenderer.invoke('runtimeEnvironments:stopOrcad', args),
  cancelStop: (args) => ipcRenderer.invoke('runtimeEnvironments:cancelOrcadStop', args),
  forget: (args) => ipcRenderer.invoke('runtimeEnvironments:forgetOrcad', args),
  linkSshAccess: (args) => ipcRenderer.invoke('runtimeEnvironments:linkSshAccess', args),
  unlinkSshAccess: (args) => ipcRenderer.invoke('runtimeEnvironments:unlinkSshAccess', args),
  convertSshHost: (args) =>
    ipcRenderer.invoke('runtimeEnvironments:convertSshHostToManagedOrcad', args),
  listPendingMigrations: () => ipcRenderer.invoke('runtimeEnvironments:listPendingOrcadMigrations'),
  previewDeltaMove: (args) => ipcRenderer.invoke('runtimeEnvironments:previewOrcadDeltaMove', args),
  moveDelta: (args) => ipcRenderer.invoke('runtimeEnvironments:moveOrcadDelta', args),
  keepServerVersion: (args) =>
    ipcRenderer.invoke('runtimeEnvironments:keepOrcadServerVersion', args),
  allowMoveLeavingBehind: (args) =>
    ipcRenderer.invoke('runtimeEnvironments:allowOrcadMoveLeavingBehind', args),
  autoUpdateStatus: () => ipcRenderer.invoke('runtimeEnvironments:serverAutoUpdateStatus'),
  autoUpdateNow: (args) => ipcRenderer.invoke('runtimeEnvironments:serverAutoUpdateNow', args),
  setAutoUpdateMode: (args) =>
    ipcRenderer.invoke('runtimeEnvironments:setServerAutoUpdateMode', args),
  onAutoUpdateChanged: (callback) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      statuses: ServerAutoUpdateHostStatus[]
    ): void => callback(statuses)
    ipcRenderer.on(SERVER_AUTO_UPDATE_CHANGED_CHANNEL, listener)
    return () => ipcRenderer.removeListener(SERVER_AUTO_UPDATE_CHANGED_CHANNEL, listener)
  }
}
