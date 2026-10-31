import { Bell, BellOff } from 'lucide-react'
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { SwitchIndicator } from '@/components/ui/switch'
import { togglePhoneNotify, usePhoneNotifySetting } from './use-phone-notify-setting'

function PhoneNotifyNote({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <p className="px-2 pb-2 text-xs leading-snug text-muted-foreground">{children}</p>
}

/**
 * "Notify me" in the header menu: Web Push from the host while the app is closed. Absent when the
 * browser or the host cannot do it, so an older host never shows a switch that fails.
 */
export function PhoneNotifyMenuItem(): React.JSX.Element | null {
  const setting = usePhoneNotifySetting((state) => state.setting)
  if (setting.status === 'checking' || setting.status === 'hidden') {
    return null
  }
  if (setting.status === 'home-screen' || setting.status === 'blocked') {
    return (
      <>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled className="min-h-11">
          <BellOff aria-hidden />
          Notifications unavailable
        </DropdownMenuItem>
        <PhoneNotifyNote>
          {setting.status === 'home-screen'
            ? 'Add Aster to your Home Screen from Safari, then open it there to get notifications.'
            : 'Notifications are blocked. Allow them for Aster in Settings → Notifications.'}
        </PhoneNotifyNote>
      </>
    )
  }
  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        role="menuitemcheckbox"
        aria-checked={setting.enabled}
        disabled={setting.busy}
        className="min-h-11"
        data-phone-notify-toggle=""
        onSelect={(event) => {
          // Why kept open: the switch flipping is the confirmation.
          event.preventDefault()
          togglePhoneNotify()
        }}
      >
        <Bell aria-hidden />
        <span className="flex-1">Notify me</span>
        <SwitchIndicator checked={setting.enabled} />
      </DropdownMenuItem>
      <PhoneNotifyNote>
        {setting.error ??
          'When an agent needs you or a Run ends, even with Aster closed. Sends names only.'}
      </PhoneNotifyNote>
    </>
  )
}
