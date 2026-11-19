import { translate } from '@/i18n/i18n'
import { Switch } from '@/components/ui/switch'
export function BrowserUseEnableSwitch({
  enabled,
  onToggle
}: {
  enabled: boolean
  onToggle: () => void
}): React.JSX.Element {
  return (
    <Switch
      checked={enabled}
      aria-label={translate(
        'auto.components.settings.BrowserUseEnableSwitch.aea3f45349',
        'Enable agent browser use'
      )}
      onCheckedChange={onToggle}
    />
  )
}
