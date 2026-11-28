import { useState } from 'react'
import { toast } from 'sonner'
import {
  isServerAutoUpdateMode,
  SERVER_AUTO_UPDATE_MODES,
  type ServerAutoUpdateHostStatus,
  type ServerAutoUpdateMode
} from '../../../../shared/server-auto-update'
import type { ManagedOrcadPreloadApi } from '../../../../preload/api/managed-orcad-api'
import { translate } from '@/i18n/i18n'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { followGlobalSettingLabel, serverAutoUpdateModeLabel } from './server-auto-update-copy'

type HostChoice = 'global' | ServerAutoUpdateMode

/** This host's own choice, or "global" when it follows the setting for every host. */
export function hostAutoUpdateChoice(
  status: Pick<ServerAutoUpdateHostStatus, 'mode' | 'modeSource'>
): HostChoice {
  return status.modeSource === 'host' ? status.mode : 'global'
}

export function ServerAutoUpdateHostModeSelect({
  status,
  api,
  globalMode
}: {
  status: ServerAutoUpdateHostStatus
  api: Pick<ManagedOrcadPreloadApi, 'setAutoUpdateMode'>
  globalMode: unknown
}): React.JSX.Element {
  const stored = hostAutoUpdateChoice(status)
  // Why: the desktop re-broadcasts the statuses after the write; show the pick at once, and stop
  // showing it once the stored choice has moved on from what it was when the pick was made.
  const [picked, setPicked] = useState<{ choice: HostChoice; storedWas: HostChoice } | null>(null)
  const value = picked && picked.storedWas === stored ? picked.choice : stored

  const choose = (next: string): void => {
    const choice = next === 'global' ? 'global' : isServerAutoUpdateMode(next) ? next : null
    if (!choice || choice === value) {
      return
    }
    setPicked({ choice, storedWas: stored })
    // Why null: it clears the host's own choice, so the host follows the global setting again.
    api
      .setAutoUpdateMode({
        sshTargetId: status.sshTargetId,
        mode: choice === 'global' ? null : choice
      })
      .catch((error: unknown) => {
        setPicked(null)
        toast.error(error instanceof Error ? error.message : String(error))
      })
  }

  return (
    <Select value={value} onValueChange={choose}>
      <SelectTrigger
        size="sm"
        data-testid="server-auto-update-host-mode"
        aria-label={translate(
          'auto.components.settings.serverAutoUpdate.hostModeAria',
          'Automatic updates for {{host}}',
          { host: status.hostLabel }
        )}
        className="w-auto"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="global">{followGlobalSettingLabel(globalMode)}</SelectItem>
        {SERVER_AUTO_UPDATE_MODES.map((mode) => (
          <SelectItem key={mode} value={mode}>
            {serverAutoUpdateModeLabel(mode)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
