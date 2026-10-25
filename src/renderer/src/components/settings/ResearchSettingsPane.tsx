import { useEffect, useMemo, useState } from 'react'
import { Cpu, Server } from 'lucide-react'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { buildDefaultAgentSettingsUpdate } from '../../../../shared/default-agent-settings'
import { isTuiAgentEnabled } from '../../../../shared/tui-agent-selection'
import { getAgentCatalog } from '@/lib/agent-catalog'
import { useDetectedAgents } from '@/hooks/useDetectedAgents'
import { getIntlLocale, translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { getResearchUiSearchEntry, ResearchUiSetting } from '@/features/research/ResearchUiSetting'
import { useConferenceDeadlines } from '@/features/research/conference-deadlines-store'
import { useConferenceTrackingActions } from '@/features/research/use-conference-tracking-actions'
import { ResearchDeadlineZonePicker } from '@/features/research/research-deadline-zone-picker'
import {
  READING_LANGUAGES,
  useReadingLanguage
} from '@/features/research/research-library-reading-language'
import { openResearchHome } from '@/features/research/research-navigation'
import { Button } from '../ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { AgentDefaultSetting } from './AgentDefaultSetting'
import { SearchableSetting } from './SearchableSetting'
import { SettingsRow } from './SettingsFormControls'
import { SettingsSectionStack } from './SettingsSectionStack'
import { matchesSettingsSearch, type SettingsSearchEntry } from './settings-search'
import {
  getResearchComputeSearchEntry,
  getResearchDeadlineZoneSearchEntry,
  getResearchDefaultAgentSearchEntry,
  getResearchReadingLanguageSearchEntry
} from './research-settings-search'

const LOCAL_DETECTION_TARGET = { kind: 'local' } as const

type ResearchSettingsPaneProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void | Promise<void>
  onOpenSshHosts: () => void
}

export function ResearchSettingsPane({
  settings,
  updateSettings,
  onOpenSshHosts
}: ResearchSettingsPaneProps): React.JSX.Element {
  const query = useAppStore((state) => state.settingsSearchQuery)
  // Why: drop non-matching rows here so the stack does not draw separators around empty slots.
  const shown = (entry: SettingsSearchEntry): boolean => matchesSettingsSearch(query, entry)
  return (
    <SettingsSectionStack
      spacing="section"
      sections={[
        shown(getResearchUiSearchEntry()) ? <ResearchUiSetting key="layout" /> : null,
        shown(getResearchDefaultAgentSearchEntry()) ? (
          <ResearchDefaultAgentSetting
            key="agent"
            settings={settings}
            updateSettings={updateSettings}
          />
        ) : null,
        shown(getResearchDeadlineZoneSearchEntry()) ? (
          <ResearchDeadlineZoneSetting key="deadlines" />
        ) : null,
        shown(getResearchReadingLanguageSearchEntry()) ? (
          <ResearchReadingLanguageSetting key="library" />
        ) : null,
        shown(getResearchComputeSearchEntry()) ? (
          <ResearchComputeSetting key="compute" onOpenSshHosts={onOpenSshHosts} />
        ) : null
      ]}
    />
  )
}

function ResearchDefaultAgentSetting({
  settings,
  updateSettings
}: Omit<ResearchSettingsPaneProps, 'onOpenSshHosts'>): React.JSX.Element {
  const entry = getResearchDefaultAgentSearchEntry()
  const { detectedIds: detected } = useDetectedAgents(LOCAL_DETECTION_TARGET)
  const detectedIds = useMemo(() => (detected ? new Set(detected) : null), [detected])
  const catalog = getAgentCatalog()
  const enabledDetectedAgents = catalog.filter(
    (agent) =>
      detectedIds?.has(agent.id) === true && isTuiAgentEnabled(agent.id, settings.disabledTuiAgents)
  )
  return (
    <SearchableSetting {...entry} id={entry.targetSectionId}>
      <AgentDefaultSetting
        defaultAgent={settings.defaultTuiAgent}
        detectedIds={detectedIds}
        enabledDetectedAgents={enabledDetectedAgents}
        catalog={catalog}
        description={entry.description ?? ''}
        onSetDefault={(agent) => void updateSettings(buildDefaultAgentSettingsUpdate(agent))}
      />
    </SearchableSetting>
  )
}

function ResearchDeadlineZoneSetting(): React.JSX.Element {
  const entry = getResearchDeadlineZoneSearchEntry()
  const tracking = useConferenceDeadlines((state) => state.tracking)
  const actions = useConferenceTrackingActions()
  // Why: the offset label only needs to be right when the pane opens, not tick every minute.
  const [now] = useState(Date.now)
  useEffect(() => {
    void useConferenceDeadlines.getState().load()
  }, [])
  return (
    <SearchableSetting {...entry} id={entry.targetSectionId}>
      <SettingsRow
        label={entry.title}
        description={entry.description}
        control={
          <ResearchDeadlineZonePicker
            value={tracking?.displayTimeZone ?? null}
            now={now}
            locale={getIntlLocale()}
            disabled={!tracking || actions.saving}
            onChange={actions.setDisplayTimeZone}
          />
        }
      />
    </SearchableSetting>
  )
}

function ResearchReadingLanguageSetting(): React.JSX.Element {
  const entry = getResearchReadingLanguageSearchEntry()
  const [language, setLanguage] = useReadingLanguage()
  const choose = (value: string): void => {
    const next = READING_LANGUAGES.find((option) => option.id === value)
    if (next) {
      setLanguage(next.id)
    }
  }
  return (
    <SearchableSetting {...entry} id={entry.targetSectionId}>
      <SettingsRow
        label={entry.title}
        description={entry.description}
        control={
          <Select value={language} onValueChange={choose}>
            <SelectTrigger className="w-[180px]" aria-label={entry.title}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {READING_LANGUAGES.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />
    </SearchableSetting>
  )
}

function ResearchComputeSetting({
  onOpenSshHosts
}: Pick<ResearchSettingsPaneProps, 'onOpenSshHosts'>): React.JSX.Element {
  const entry = getResearchComputeSearchEntry()
  return (
    <SearchableSetting {...entry} id={entry.targetSectionId}>
      <SettingsRow
        label={entry.title}
        description={entry.description}
        control={
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onOpenSshHosts}>
              <Server aria-hidden />
              {translate('research.settings.manageSshHosts', 'SSH hosts')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => openResearchHome('research-compute')}
            >
              <Cpu aria-hidden />
              {translate('research.settings.openCompute', 'Open Compute')}
            </Button>
          </div>
        }
      />
    </SearchableSetting>
  )
}
