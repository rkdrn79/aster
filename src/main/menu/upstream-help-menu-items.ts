import { translateMain } from '../i18n/main-i18n'
import { PRODUCT_BRAND } from '../../shared/product-brand'

type OpenHelp = (window?: Electron.BaseWindow | null) => void

export function upstreamHelpMenuItems(options: {
  onOpenFeatureTour: OpenHelp
  onOpenSetupGuide: OpenHelp
}): Electron.MenuItemConstructorOptions[] {
  // The tour and setup guide teach upstream workflows and link to upstream docs.
  if (PRODUCT_BRAND.links.docs === null) {
    return []
  }
  return [
    { type: 'separator' },
    {
      label: translateMain('menu.exploreOrca', 'Explore Aster'),
      click: (_menuItem, window) => options.onOpenFeatureTour(window)
    },
    {
      label: translateMain('menu.gettingStarted', 'Getting Started with Aster'),
      click: (_menuItem, window) => options.onOpenSetupGuide(window)
    }
  ]
}
