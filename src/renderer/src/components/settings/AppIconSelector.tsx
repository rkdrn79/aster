import type React from 'react'
import asterIconUrl from '../../../../../resources/build/aster.png?url'
import { translate } from '@/i18n/i18n'

export function AppIconSelector(): React.JSX.Element {
  return (
    <div className="flex items-center justify-center">
      <img
        src={asterIconUrl}
        alt={translate('auto.components.settings.AppIconSelector.415fa76f64', 'Selected app icon')}
        className="size-24 rounded-2xl object-contain"
      />
    </div>
  )
}
