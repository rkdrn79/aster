import { CalendarClock, Cpu, LayoutGrid } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { PRODUCT_NAME } from '../../../../shared/product-brand'
import { useAppStore } from '@/store'
import { enterResearchWorkspace, openResearchHome } from './research-navigation'
import { useResearchHomeProjects } from './research-home-projects'
import { ResearchOptionsMenu } from './ResearchOptionsMenu'
import { ResearchComputeProjectDot } from './ResearchComputeProjectDot'
import { ResearchDeadlineNavBadge } from './research-deadline-nav-badge'
import { ResearchProjectRowMenu } from './ResearchProjectRowMenu'

/** Home sidebar: everything that spans projects, plus a way into each one. */
export function ResearchHomeNavigation(): React.JSX.Element {
  useTranslation()
  const activeView = useAppStore((state) => state.activeView)
  const projects = useResearchHomeProjects()
  const onProjects = activeView === 'terminal'

  return (
    <nav
      aria-label={translate('research.home.label', '{{product}} home', { product: PRODUCT_NAME })}
      className="scrollbar-sleek min-h-0 flex-1 space-y-3 overflow-y-auto p-3"
    >
      <div className="space-y-1">
        <div className="flex items-center gap-1">
          <Button
            variant={onProjects ? 'secondary' : 'ghost'}
            size="sm"
            className="min-w-0 flex-1 justify-start"
            aria-current={onProjects ? 'page' : undefined}
            onClick={() => openResearchHome()}
          >
            <LayoutGrid aria-hidden />
            {translate('research.home.overview', 'Home')}
          </Button>
          <ResearchOptionsMenu />
        </div>
        <Button
          variant={activeView === 'research-deadlines' ? 'secondary' : 'ghost'}
          size="sm"
          className="w-full justify-start"
          aria-current={activeView === 'research-deadlines' ? 'page' : undefined}
          onClick={() => openResearchHome('research-deadlines')}
        >
          <CalendarClock aria-hidden />
          {translate('research.navigation.deadlines', 'Deadlines')}
          <ResearchDeadlineNavBadge />
        </Button>
        <Button
          variant={activeView === 'research-compute' ? 'secondary' : 'ghost'}
          size="sm"
          className="w-full justify-start"
          aria-current={activeView === 'research-compute' ? 'page' : undefined}
          onClick={() => openResearchHome('research-compute')}
        >
          <Cpu aria-hidden />
          {translate('research.navigation.compute', 'Compute')}
        </Button>
      </div>
      {projects.length > 0 ? (
        <div className="space-y-1 border-t border-worktree-sidebar-border pt-3">
          {projects.map((project) => (
            <ResearchProjectRowMenu key={project.key} project={project} showTrigger>
              <Button
                variant="ghost"
                size="sm"
                className="min-w-0 flex-1 justify-start"
                title={project.name}
                onClick={() => enterResearchWorkspace(project.workspaces[0])}
              >
                <ResearchComputeProjectDot color={project.badgeColor} />
                <span className="truncate">{project.name}</span>
              </Button>
            </ResearchProjectRowMenu>
          ))}
        </div>
      ) : null}
    </nav>
  )
}
