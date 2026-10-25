import { FlaskConical } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'
import type { SettingsNavSection } from '@/lib/settings-navigation-types'
import { getResearchUiSearchEntry } from '@/features/research/ResearchUiSetting'
import type { SettingsSearchEntry } from './settings-search'
import { RESEARCH_SETTINGS_SECTION_ID } from './settings-research-layout'

export const getResearchDefaultAgentSearchEntry = createLocalizedCatalog(
  (): SettingsSearchEntry => ({
    title: translate('research.settings.defaultAgentTitle', 'Default research agent'),
    description: translate(
      'research.settings.defaultAgentDescription',
      'Starts experiment chats, reviews and paper reading, and new agent tabs.'
    ),
    keywords: ['agent', 'default', 'claude', 'codex', 'research', 'chat'],
    targetSectionId: 'research-default-agent'
  })
)

export const getResearchDeadlineZoneSearchEntry = createLocalizedCatalog(
  (): SettingsSearchEntry => ({
    title: translate('research.settings.deadlineZoneTitle', 'Deadline time zone'),
    description: translate(
      'research.settings.deadlineZoneDescription',
      'Time zone for conference deadlines and countdowns.'
    ),
    keywords: ['deadline', 'conference', 'time zone', 'timezone', 'aoe', 'countdown'],
    targetSectionId: 'research-deadline-zone'
  })
)

export const getResearchReadingLanguageSearchEntry = createLocalizedCatalog(
  (): SettingsSearchEntry => ({
    title: translate('research.settings.readingLanguageTitle', 'Reading language'),
    description: translate(
      'research.settings.readingLanguageDescription',
      'Language the Library reading agent explains and translates papers in.'
    ),
    keywords: ['library', 'paper', 'reading', 'language', 'translate', 'explain'],
    targetSectionId: 'research-reading-language'
  })
)

export const getResearchComputeSearchEntry = createLocalizedCatalog((): SettingsSearchEntry => ({
  title: translate('research.settings.computeTitle', 'Compute hosts'),
  description: translate(
    'research.settings.computeDescription',
    'SSH hosts and GPU servers that run experiments.'
  ),
  keywords: ['compute', 'gpu', 'ssh', 'server', 'cluster', 'slurm', 'host'],
  targetSectionId: 'research-compute'
}))

export function getResearchSettingsSearchEntries(): SettingsSearchEntry[] {
  return [
    getResearchUiSearchEntry(),
    getResearchDefaultAgentSearchEntry(),
    getResearchDeadlineZoneSearchEntry(),
    getResearchReadingLanguageSearchEntry(),
    getResearchComputeSearchEntry()
  ]
}

export function getResearchSettingsSection(): SettingsNavSection {
  return {
    id: RESEARCH_SETTINGS_SECTION_ID,
    title: translate('research.settings.title', 'Research'),
    description: translate(
      'research.settings.description',
      'Layout, research agent, deadlines, Library and compute.'
    ),
    icon: FlaskConical,
    searchEntries: getResearchSettingsSearchEntries(),
    group: 'research'
  }
}
