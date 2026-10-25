import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  BookOpen,
  ChevronRight,
  FilePenLine,
  FlaskConical,
  PanelsTopLeft
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import {
  openResearchHome,
  openResearchView,
  selectResearchInsideProject
} from './research-navigation'
import { useResearchActiveProject } from './research-home-projects'
import { ExperimentExplorer } from './ExperimentExplorer'
import { ResearchWorkspaceChats } from './ResearchWorkspaceChats'
import { ResearchHomeNavigation } from './ResearchHomeNavigation'
import { ResearchOptionsMenu } from './ResearchOptionsMenu'
import { ResearchComputeProjectDot } from './ResearchComputeProjectDot'
import { ResearchSidebarAgentConversations } from './ResearchSidebarAgentConversations'
import { RESEARCH_CONVERSATION_DRAG_TYPE } from './research-conversation-drag'
import { useResearchSidebarSections } from './research-sidebar-sections'
import { ResearchProjectRowMenu } from './ResearchProjectRowMenu'

export function ResearchNavigation(): React.JSX.Element {
  const insideProject = useAppStore(selectResearchInsideProject)
  return insideProject ? <ResearchProjectNavigation /> : <ResearchHomeNavigation />
}

/** Inside one project: only the research surfaces that belong to it. */
function ResearchProjectNavigation(): React.JSX.Element {
  useTranslation()
  const [experimentActionsHost, setExperimentActionsHost] = useState<HTMLSpanElement | null>(null)
  const activeView = useAppStore((state) => state.activeView)
  const activeWorkspaceId = useAppStore((state) => state.activeWorktreeId)
  const { project } = useResearchActiveProject()
  const [sections, setSectionOpen] = useResearchSidebarSections(project?.key ?? activeWorkspaceId)
  const workbenchOpen = sections.workbench
  const experimentsOpen = sections.experiments
  const writingOpen = sections.writing
  const libraryOpen = sections.library
  const onExperiment = activeView === 'research-runs' || activeView === 'research-compare'
  const openSection = useRef(setSectionOpen)
  useEffect(() => {
    openSection.current = setSectionOpen
  })
  // Why: only arriving on an Experiment reveals its row; folding the list there must stick.
  useEffect(() => {
    if (onExperiment) {
      openSection.current('experiments', true)
    }
  }, [onExperiment])
  const items = [
    {
      view: 'research-writing',
      label: translate('research.navigation.writing', 'Writing'),
      Icon: FilePenLine
    },
    {
      view: 'research-library',
      label: translate('research.navigation.library', 'Library'),
      Icon: BookOpen
    }
  ] as const

  return (
    <nav
      aria-label={translate('research.navigation.label', 'Research navigation')}
      className="scrollbar-sleek min-h-0 flex-1 space-y-3 overflow-y-auto p-3"
    >
      <div className="space-y-1">
        <Button variant="ghost" size="xs" onClick={() => openResearchHome()}>
          <ArrowLeft aria-hidden />
          {translate('research.navigation.back', 'Projects')}
        </Button>
        {project ? (
          // Why: the same project actions as its Home card; this row's "⋯" stays the app menu.
          <ResearchProjectRowMenu
            project={project}
            showTrigger={false}
            className="gap-2 px-2 text-worktree-sidebar-foreground"
          >
            <ResearchComputeProjectDot color={project.badgeColor} />
            <span className="min-w-0 flex-1 truncate text-base font-semibold" title={project.name}>
              {project.name}
            </span>
            <ResearchOptionsMenu />
          </ResearchProjectRowMenu>
        ) : (
          <div className="flex items-center gap-2 px-2 text-worktree-sidebar-foreground">
            <ResearchComputeProjectDot color={null} />
            <span className="min-w-0 flex-1 truncate text-base font-semibold">
              {translate('research.navigation.project', 'Project')}
            </span>
            <ResearchOptionsMenu />
          </div>
        )}
      </div>
      <div className="space-y-1">
        <div className="flex min-w-0 items-center gap-1">
          <Button
            variant={activeView === 'terminal' ? 'secondary' : 'ghost'}
            size="sm"
            className="min-w-0 flex-1 justify-start"
            aria-current={activeView === 'terminal' ? 'page' : undefined}
            onClick={() => openResearchView('terminal')}
          >
            <PanelsTopLeft aria-hidden />
            {translate('research.navigation.workbench', 'Workbench')}
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label={workbenchOpen ? 'Collapse conversations' : 'Expand conversations'}
            aria-expanded={workbenchOpen}
            aria-controls="research-workbench-conversations"
            onClick={() => setSectionOpen('workbench', !workbenchOpen)}
          >
            <ChevronRight className={workbenchOpen ? 'rotate-90' : ''} aria-hidden />
          </Button>
        </div>
        <div
          id="research-workbench-conversations"
          className={workbenchOpen ? 'ml-4 border-l border-worktree-sidebar-border pl-2' : 'hidden'}
        >
          {workbenchOpen ? <ResearchWorkspaceChats /> : null}
        </div>
        <div className="flex min-w-0 items-center gap-1">
          <Button
            // Why: on an Experiment its row is the current one, unless the list is folded away.
            variant={
              activeView === 'research-experiments' || (onExperiment && !experimentsOpen)
                ? 'secondary'
                : 'ghost'
            }
            size="sm"
            className="min-w-0 flex-1 justify-start"
            aria-current={activeView === 'research-experiments' ? 'page' : undefined}
            onDragEnter={(event) => {
              if (Array.from(event.dataTransfer.types).includes(RESEARCH_CONVERSATION_DRAG_TYPE)) {
                setSectionOpen('experiments', true)
              }
            }}
            onClick={() => openResearchView('research-experiments')}
          >
            <FlaskConical aria-hidden />
            Experiments
          </Button>
          <span ref={setExperimentActionsHost} className="flex shrink-0 items-center" />
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label={experimentsOpen ? 'Collapse experiments' : 'Expand experiments'}
            aria-expanded={experimentsOpen}
            aria-controls="research-experiment-list"
            onClick={() => setSectionOpen('experiments', !experimentsOpen)}
          >
            <ChevronRight className={experimentsOpen ? 'rotate-90' : ''} aria-hidden />
          </Button>
        </div>
        <div
          id="research-experiment-list"
          className={
            experimentsOpen ? 'ml-4 border-l border-worktree-sidebar-border pl-2' : 'hidden'
          }
        >
          <ExperimentExplorer
            actionsHost={experimentActionsHost}
            expanded={experimentsOpen}
            onExpand={() => setSectionOpen('experiments', true)}
          />
        </div>
        {items.map(({ view, label, Icon }) => {
          const isWriting = view === 'research-writing'
          const open = isWriting ? writingOpen : libraryOpen
          const id = isWriting ? 'research-writing-agent-list' : 'research-library-agent-list'
          return (
            <div key={view}>
              <div className="flex min-w-0 items-center gap-1">
                <Button
                  variant={activeView === view ? 'secondary' : 'ghost'}
                  size="sm"
                  className="min-w-0 flex-1 justify-start"
                  aria-current={activeView === view ? 'page' : undefined}
                  onClick={() => openResearchView(view)}
                >
                  <Icon aria-hidden />
                  {label}
                </Button>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label={`${open ? 'Collapse' : 'Expand'} ${label} agents`}
                  aria-expanded={open}
                  aria-controls={id}
                  onClick={() => setSectionOpen(isWriting ? 'writing' : 'library', !open)}
                >
                  <ChevronRight className={open ? 'rotate-90' : ''} aria-hidden />
                </Button>
              </div>
              <div
                id={id}
                className={open ? 'ml-4 border-l border-worktree-sidebar-border pl-2' : 'hidden'}
              >
                {open ? (
                  <ResearchSidebarAgentConversations kind={isWriting ? 'writing' : 'library'} />
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </nav>
  )
}
