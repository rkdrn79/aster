import { ArrowLeft } from 'lucide-react'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { usePhoneShell } from '@/phone-shell/use-phone-shell'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue
} from '../ui/select'

type CompactNavSection = { id: string; title: string }
type CompactNavGroup = { id: string; title: string; sections: CompactNavSection[] }

/**
 * Settings under the `md` breakpoint: search and a section picker above the one-column page, in
 * place of the side list that would leave the page a word wide.
 */
export function SettingsCompactNav({
  activeSectionId,
  generalGroups,
  repoSections,
  onBack,
  onSelectSection
}: {
  activeSectionId: string
  generalGroups: CompactNavGroup[]
  repoSections: CompactNavSection[]
  onBack: () => void
  onSelectSection: (sectionId: string) => void
}): React.JSX.Element {
  const searchQuery = useAppStore((state) => state.settingsSearchInputQuery)
  const onSearchChange = useAppStore((state) => state.setSettingsSearchQuery)
  // Why: the phone header already has Back; a narrowed desktop window does not.
  const phoneShell = usePhoneShell()
  const groups = [
    ...generalGroups,
    ...(repoSections.length > 0
      ? [
          {
            id: 'projects',
            title: translate('auto.components.settings.SettingsSidebar.5c9669ff9c', 'Projects'),
            sections: repoSections
          }
        ]
      : [])
  ].filter((group) => group.sections.length > 0)
  const known = groups.some((group) =>
    group.sections.some((section) => section.id === activeSectionId)
  )

  return (
    <div className="flex shrink-0 flex-col gap-2 border-b border-border bg-background px-4 py-3 md:hidden">
      {phoneShell ? null : (
        <Button variant="ghost" size="sm" onClick={onBack} className="self-start">
          <ArrowLeft className="size-4" />
          {translate('auto.components.settings.SettingsSidebar.60f8a673a7', 'Back to app')}
        </Button>
      )}
      <Input
        type="search"
        value={searchQuery}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder={translate(
          'auto.components.settings.SettingsSidebar.dbceaa8840',
          'Search settings'
        )}
        aria-label={translate(
          'auto.components.settings.SettingsSidebar.dbceaa8840',
          'Search settings'
        )}
      />
      <Select value={known ? activeSectionId : undefined} onValueChange={onSelectSection}>
        <SelectTrigger className="w-full" aria-label={translate('menu.settings', 'Settings')}>
          <SelectValue placeholder={translate('menu.settings', 'Settings')} />
        </SelectTrigger>
        <SelectContent position="popper" className="max-h-[60dvh]">
          {groups.map((group) => (
            <SelectGroup key={group.id}>
              <SelectLabel>{group.title}</SelectLabel>
              {group.sections.map((section) => (
                <SelectItem key={section.id} value={section.id}>
                  {section.title}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
