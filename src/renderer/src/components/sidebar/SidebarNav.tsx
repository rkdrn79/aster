import React from 'react'
import {
  BookOpen,
  CalendarClock,
  Check,
  Files,
  LayoutDashboard,
  List,
  MoreHorizontal,
  Search,
  Smartphone,
  type LucideIcon
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/store'
import { cn } from '@/lib/utils'
import { useShortcutKeyComboDetails } from '@/hooks/useShortcutLabel'
import { ShortcutKeyCombo } from '@/components/ShortcutKeyCombo'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { resolveAgentDashboardMode } from '@/components/dashboard/agent-dashboard-open-mode'
import { translate } from '@/i18n/i18n'
import { isUpstreamOnlySettingsSection } from '@/components/settings/upstream-settings-visibility'
import {
  ARTIFACT_SHARING_AVAILABLE,
  SKILL_SHARING_AVAILABLE
} from '@/lib/cloud-sharing-availability'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import type { TopLevelView } from '../../../../shared/ui-chrome-types'

export function shouldShowMobileButton(
  settings: Partial<Pick<GlobalSettings, 'showMobileButton'>> | null | undefined
): boolean {
  return settings?.showMobileButton !== false
}

export function shouldShowAutomationsButton(
  settings: Partial<Pick<GlobalSettings, 'showAutomationsButton'>> | null | undefined
): boolean {
  return settings?.showAutomationsButton !== false
}

export function shouldShowArtifactsButton(
  settings: Partial<Pick<GlobalSettings, 'showArtifactsButton'>> | null | undefined
): boolean {
  return settings?.showArtifactsButton === true
}

export function shouldShowSkillsButton(
  settings: Partial<Pick<GlobalSettings, 'showSkillsButton'>> | null | undefined
): boolean {
  return settings?.showSkillsButton === true
}

export function shouldShowAgentDashboardButton(
  settings: Partial<Pick<GlobalSettings, 'experimentalAgentDashboardPopout'>> | null | undefined
): boolean {
  return settings?.experimentalAgentDashboardPopout === true
}

type MoreDestination = {
  id: string
  label: string
  Icon: LucideIcon
  view: TopLevelView | null
  open: () => void
}

/** Pages the classic layout reaches rarely; the sidebar settings that hide them still apply. */
function useMoreDestinations(): MoreDestination[] {
  const settings = useAppStore((s) => s.settings)
  const openTaskPage = useAppStore((s) => s.openTaskPage)
  const openAutomationsPage = useAppStore((s) => s.openAutomationsPage)
  const openSkillsPage = useAppStore((s) => s.openSkillsPage)
  const openArtifactsPage = useAppStore((s) => s.openArtifactsPage)
  const openMobilePage = useAppStore((s) => s.openMobilePage)
  const destinations: MoreDestination[] = []
  if (settings?.showTasksButton !== false) {
    destinations.push({
      id: 'tasks',
      label: translate('auto.components.sidebar.SidebarNav.fee535205b', 'Tasks'),
      Icon: List,
      view: 'tasks',
      open: () => openTaskPage()
    })
  }
  if (shouldShowAutomationsButton(settings)) {
    destinations.push({
      id: 'automations',
      label: translate('auto.components.sidebar.SidebarNav.f323383e9a', 'Automations'),
      Icon: CalendarClock,
      view: 'automations',
      open: openAutomationsPage
    })
  }
  if (SKILL_SHARING_AVAILABLE && shouldShowSkillsButton(settings)) {
    destinations.push({
      id: 'skills',
      label: translate('auto.components.sidebar.SidebarNav.skills', 'Skills'),
      Icon: BookOpen,
      view: 'skills',
      open: openSkillsPage
    })
  }
  if (ARTIFACT_SHARING_AVAILABLE && shouldShowArtifactsButton(settings)) {
    destinations.push({
      id: 'artifacts',
      label: translate('auto.components.sidebar.SidebarNav.artifacts', 'Artifacts'),
      Icon: Files,
      view: 'artifacts',
      open: openArtifactsPage
    })
  }
  if (shouldShowAgentDashboardButton(settings)) {
    destinations.push({
      id: 'agent-dashboard',
      label: translate('dashboard.sidebar.dashboardLabel', 'Agent Dashboard'),
      Icon: LayoutDashboard,
      view: null,
      open: () => {
        const state = useAppStore.getState()
        if (resolveAgentDashboardMode(state.settings) === 'popout') {
          void window.api.dashboard.openPopout()
        } else {
          state.setAgentDashboardDrawerOpen(!state.agentDashboardDrawerOpen)
        }
      }
    })
  }
  if (shouldShowMobileButton(settings) && !isUpstreamOnlySettingsSection('mobile')) {
    destinations.push({
      id: 'mobile',
      label: translate('research.navigation.mobile', 'Mobile'),
      Icon: Smartphone,
      view: 'mobile',
      open: openMobilePage
    })
  }
  return destinations
}

const SidebarNav = React.memo(function SidebarNav() {
  // Why: this memo boundary needs its own language subscription, while
  // translate() preserves the pseudo-localization behavior.
  useTranslation()
  const worktreePaletteShortcutCombos = useShortcutKeyComboDetails('worktree.palette')
  const openModal = useAppStore((s) => s.openModal)
  const activeView = useAppStore((s) => s.activeView)
  const destinations = useMoreDestinations()
  const current = destinations.find((destination) => destination.view === activeView)

  return (
    <nav
      aria-label={translate('sidebar.codeNavigation.label', 'Code navigation')}
      className="shrink-0 space-y-1 px-3 pt-2"
      data-contextual-tour-target="sidebar-navigation"
    >
      <Button
        variant="ghost"
        size="sm"
        onClick={() => openModal('worktree-palette')}
        aria-label={translate(
          'auto.components.sidebar.SidebarNav.0c3395fd32',
          'Search worktrees and browser tabs'
        )}
        className="group w-full justify-start text-muted-foreground"
      >
        <Search aria-hidden />
        <span className="flex-1 text-left">
          {translate('auto.components.sidebar.SidebarNav.80611a8b10', 'Search')}
        </span>
        <span className="pointer-events-none hidden shrink-0 items-center gap-1 group-hover:flex group-focus-visible:flex">
          {worktreePaletteShortcutCombos.map((combo) => (
            <ShortcutKeyCombo
              key={combo.keys.join('-')}
              keys={combo.keys}
              doubleTap={combo.doubleTap}
              className="inline-flex gap-0.5"
              keyCapClassName="min-w-4 px-1 py-px text-3xs shadow-none"
              separatorClassName="text-3xs text-muted-foreground"
            />
          ))}
        </span>
      </Button>
      {destinations.length > 0 ? (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              variant={current ? 'secondary' : 'ghost'}
              size="sm"
              aria-current={current ? 'page' : undefined}
              className={cn('w-full justify-start', !current && 'text-muted-foreground')}
            >
              {current ? <current.Icon aria-hidden /> : <MoreHorizontal aria-hidden />}
              {current ? current.label : translate('sidebar.codeNavigation.more', 'More')}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            {destinations.map(({ id, label, Icon, view, open }) => (
              <DropdownMenuItem key={id} onSelect={open}>
                <Icon aria-hidden />
                <span className="flex-1">{label}</span>
                {view !== null && view === activeView ? (
                  <Check className="size-3.5 text-muted-foreground" aria-hidden />
                ) : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </nav>
  )
})

export default SidebarNav
