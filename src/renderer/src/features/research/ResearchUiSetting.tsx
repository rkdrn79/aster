import { useState } from 'react'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { SearchableSetting } from '@/components/settings/SearchableSetting'
import { SettingsRow, SettingsSegmentedControl } from '@/components/settings/SettingsFormControls'
import { setResearchUiEnabled } from './research-navigation'

type AppLayout = 'research' | 'code'

export function getResearchUiSearchEntry() {
  return {
    title: translate('research.settings.layoutTitle', 'Layout'),
    description: translate(
      'research.settings.layoutDescription',
      'Research centers on projects and papers; Code is the classic worktree, terminal and editor layout.'
    ),
    keywords: ['layout', 'research', 'code', 'classic', 'workbench', 'worktrees']
  }
}

export function ResearchUiSetting(): React.JSX.Element {
  const enabled = useAppStore((state) => state.settings?.researchUiEnabled === true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const entry = getResearchUiSearchEntry()

  async function choose(layout: AppLayout): Promise<void> {
    if (saving || (layout === 'research') === enabled) {
      return
    }
    setSaving(true)
    setError(null)
    try {
      await setResearchUiEnabled(layout === 'research')
    } catch {
      setError(translate('sidebar.layoutSwitcher.error', 'The layout was not switched. Try again.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <SearchableSetting {...entry} id="research-ui">
      <SettingsRow
        label={entry.title}
        description={entry.description}
        control={
          <SettingsSegmentedControl<AppLayout>
            value={enabled ? 'research' : 'code'}
            onChange={(layout) => void choose(layout)}
            ariaLabel={entry.title}
            options={[
              {
                value: 'research',
                label: translate('sidebar.layoutSwitcher.research', 'Research'),
                disabled: saving
              },
              {
                value: 'code',
                label: translate('sidebar.layoutSwitcher.code', 'Code'),
                disabled: saving
              }
            ]}
          />
        }
      />
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </SearchableSetting>
  )
}
