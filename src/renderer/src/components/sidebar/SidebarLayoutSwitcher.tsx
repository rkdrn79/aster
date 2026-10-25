import { useState } from 'react'
import { FlaskConical, SquareTerminal } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { setResearchUiEnabled } from '@/features/research/research-navigation'

type SidebarLayout = 'research' | 'code'

const SEGMENT_CLASS =
  'h-6 flex-1 gap-1.5 rounded-[5px] px-2 text-xs text-muted-foreground hover:bg-transparent hover:text-worktree-sidebar-foreground data-[state=on]:bg-secondary data-[state=on]:text-secondary-foreground [&_svg:not([class*=size-])]:size-3.5'

/** The same two-way switch tops the sidebar in both layouts, so the way back is always where you left. */
export function SidebarLayoutSwitcher(): React.JSX.Element {
  useTranslation()
  const researchUiEnabled = useAppStore((state) => state.settings?.researchUiEnabled === true)
  const [saving, setSaving] = useState(false)
  const layout: SidebarLayout = researchUiEnabled ? 'research' : 'code'

  async function switchTo(next: string): Promise<void> {
    if ((next !== 'research' && next !== 'code') || next === layout) {
      return
    }
    setSaving(true)
    try {
      await setResearchUiEnabled(next === 'research')
    } catch {
      toast.error(
        translate('sidebar.layoutSwitcher.error', 'The layout was not switched. Try again.')
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="shrink-0 px-3 pt-3">
      <ToggleGroup
        type="single"
        size="xs"
        value={layout}
        disabled={saving}
        onValueChange={(next) => void switchTo(next)}
        aria-label={translate('sidebar.layoutSwitcher.label', 'Layout')}
        className="flex w-full gap-0.5 rounded-md border border-worktree-sidebar-border p-0.5"
      >
        <ToggleGroupItem value="research" className={SEGMENT_CLASS}>
          <FlaskConical aria-hidden />
          {translate('sidebar.layoutSwitcher.research', 'Research')}
        </ToggleGroupItem>
        <ToggleGroupItem value="code" className={SEGMENT_CLASS}>
          <SquareTerminal aria-hidden />
          {translate('sidebar.layoutSwitcher.code', 'Code')}
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  )
}
