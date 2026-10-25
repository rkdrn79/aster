import { translate } from '@/i18n/i18n'
import { ResearchSettingsPane } from './ResearchSettingsPane'
import { SettingsSection } from './SettingsSection'
import type { SettingsRenderContext } from './settings-render-context'
import { RESEARCH_SETTINGS_SECTION_ID } from './settings-research-layout'

export function renderResearchSettingsSection(
  context: SettingsRenderContext
): React.JSX.Element | null {
  const { model, navigation, actions, view } = context
  if (model.settings.researchUiEnabled !== true) {
    return null
  }
  return (
    <SettingsSection
      id={RESEARCH_SETTINGS_SECTION_ID}
      title={translate('research.settings.title', 'Research')}
      description={translate(
        'research.settings.paneDescription',
        'How Aster lays out projects, which agent it starts, and where deadlines, papers and runs live.'
      )}
      searchEntries={navigation.getSectionSearchEntries(RESEARCH_SETTINGS_SECTION_ID)}
    >
      {view.isSectionMounted(RESEARCH_SETTINGS_SECTION_ID) ? (
        <ResearchSettingsPane
          settings={model.settings}
          updateSettings={model.updateSettings}
          onOpenSshHosts={() => void actions.scrollToSection('ssh')}
        />
      ) : null}
    </SettingsSection>
  )
}
