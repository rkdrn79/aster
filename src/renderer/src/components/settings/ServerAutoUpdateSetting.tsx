import { useState } from 'react'
import { toast } from 'sonner'
import {
  DEFAULT_SERVER_AUTO_UPDATE_MODE,
  isServerAutoUpdateMode,
  normalizeServerAutoUpdateMode,
  SERVER_AUTO_UPDATE_MODES
} from '../../../../shared/server-auto-update'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { serverAutoUpdateModeLabel } from './server-auto-update-copy'

/** "Update servers automatically": the default for every managed server; each host can differ. */
export function ServerAutoUpdateSetting(): React.JSX.Element {
  const stored = useAppStore((state) => state.settings?.serverAutoUpdate)
  const updateSettings = useAppStore((state) => state.updateSettings)
  const [saving, setSaving] = useState(false)
  const value = normalizeServerAutoUpdateMode(stored) ?? DEFAULT_SERVER_AUTO_UPDATE_MODE

  const choose = (next: string): void => {
    if (!isServerAutoUpdateMode(next)) {
      return
    }
    setSaving(true)
    updateSettings({ serverAutoUpdate: next })
      .catch((error: unknown) =>
        toast.error(error instanceof Error ? error.message : String(error))
      )
      .finally(() => setSaving(false))
  }

  return (
    <div
      data-settings-section="server-auto-update"
      className="flex scroll-mt-8 flex-wrap items-center justify-between gap-3"
    >
      <div className="min-w-0 space-y-0.5">
        <div id="server-auto-update-label" className="text-sm font-medium">
          {translate(
            'auto.components.settings.serverAutoUpdate.settingLabel',
            'Update servers automatically'
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {translate(
            'auto.components.settings.serverAutoUpdate.settingDescription',
            'When Aster updates, each server updates too, once no agent is working on it. Terminals and jobs keep running.'
          )}
        </p>
      </div>
      <div className="shrink-0">
        <Select value={value} onValueChange={choose} disabled={saving}>
          <SelectTrigger
            size="sm"
            data-testid="server-auto-update-setting"
            className="w-40"
            aria-labelledby="server-auto-update-label"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SERVER_AUTO_UPDATE_MODES.map((mode) => (
              <SelectItem key={mode} value={mode}>
                {serverAutoUpdateModeLabel(mode)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
