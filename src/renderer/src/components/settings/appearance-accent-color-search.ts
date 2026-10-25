import type { SettingsSearchEntry } from './settings-search'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'
import { translate } from '@/i18n/i18n'
import { translateSearchKeyword } from './settings-search-keywords'

export const getAccentColorEntries = createLocalizedCatalog((): SettingsSearchEntry[] => [
  {
    title: translate('settings.appearance.accentColor.title', 'Accent Color'),
    description: translate(
      'settings.appearance.accentColor.description',
      'Colors primary actions, selection and the current page.'
    ),
    keywords: [
      ...translateSearchKeyword('settings.appearance.accentColor.keywords.accent', 'accent'),
      ...translateSearchKeyword('settings.appearance.accentColor.keywords.color', 'color'),
      ...translateSearchKeyword('settings.appearance.accentColor.keywords.colour', 'colour'),
      ...translateSearchKeyword(
        'settings.appearance.accentColor.keywords.themeColor',
        'theme color'
      ),
      ...translateSearchKeyword('settings.appearance.accentColor.keywords.highlight', 'highlight'),
      ...translateSearchKeyword('settings.appearance.accentColor.keywords.rgb', 'rgb')
    ]
  }
])
