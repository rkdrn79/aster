import { useMemo } from 'react'
import {
  BookOpen,
  CalendarClock,
  FlaskConical,
  FolderOpen,
  House,
  PenLine,
  Server,
  Settings
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAppStore } from '@/store'
import { getResolvedExecutionHostIdForWorktree } from '@/lib/resolved-worktree-execution-host'
import {
  enterResearchWorkspace,
  openResearchHome,
  openResearchView,
  selectResearchInsideProject
} from '@/features/research/research-navigation'
import {
  useResearchHomeProjects,
  type ResearchHomeProject
} from '@/features/research/research-home-projects'
import { selectResearchExperimentRecord } from '@/features/research/research-experiment-select'
import { useResearchRecords } from '@/features/research/research-records-store'
import type { CmdJQuickAction } from './quick-actions'

export type ResearchPaletteInputs = {
  projects: readonly Pick<ResearchHomeProject, 'key' | 'name' | 'workspaces'>[]
  /** The open project's Experiments; empty on the home screen. */
  experiments: readonly { id: string; name: string }[]
  insideProject: boolean
}

function destination(
  id: string,
  title: string,
  description: string,
  icon: LucideIcon,
  keywords: string[],
  go: () => void | Promise<void>
): CmdJQuickAction {
  return {
    id: `research:${id}`,
    kind: 'action',
    title,
    description,
    icon,
    verbKeywords: ['go to', 'open', 'research', ...keywords],
    isAvailable: () => ({ available: true }),
    run: async () => {
      await go()
      return { status: 'ok' }
    }
  }
}

function openSettings(): void {
  const state = useAppStore.getState()
  state.openSettingsTarget({ pane: 'research', repoId: null })
  state.openSettingsPage()
}

/** ⌘K destinations in the Research layout: pages, projects and the open project's Experiments. */
export function buildResearchQuickActions(inputs: ResearchPaletteInputs): CmdJQuickAction[] {
  const actions: CmdJQuickAction[] = [
    destination('home', 'Home', 'All research projects', House, ['projects'], () =>
      openResearchHome()
    ),
    destination(
      'deadlines',
      'Deadlines',
      'Conference deadlines',
      CalendarClock,
      ['conference', 'planning'],
      () => openResearchHome('research-deadlines')
    ),
    destination('compute', 'Compute', 'Hosts and running jobs', Server, ['gpu', 'hosts'], () =>
      openResearchHome('research-compute')
    ),
    destination(
      'settings',
      'Research settings',
      'Defaults for agents, deadlines and Library',
      Settings,
      ['preferences'],
      openSettings
    )
  ]
  if (inputs.insideProject) {
    actions.push(
      destination(
        'experiments',
        'Experiments',
        'This project’s Experiments',
        FlaskConical,
        ['runs'],
        () => openResearchView('research-experiments')
      ),
      destination('writing', 'Writing', 'The paper and LaTeX source', PenLine, ['paper'], () =>
        openResearchView('research-writing')
      ),
      destination('library', 'Library', 'Papers and reading', BookOpen, ['papers', 'read'], () =>
        openResearchView('research-library')
      )
    )
    for (const experiment of inputs.experiments) {
      actions.push(
        destination(
          `experiment:${experiment.id}`,
          experiment.name,
          'Experiment',
          FlaskConical,
          ['experiment'],
          async () => {
            await selectResearchExperimentRecord(experiment.id).catch(() => undefined)
            openResearchView('research-experiments')
          }
        )
      )
    }
  }
  for (const project of inputs.projects) {
    const workspace = project.workspaces[0]
    if (workspace) {
      actions.push(
        destination(
          `project:${project.key}`,
          project.name,
          'Research project',
          FolderOpen,
          ['project'],
          () => enterResearchWorkspace(workspace)
        )
      )
    }
  }
  return actions
}

/** Research destinations while the Research layout is on; nothing in the Code layout. */
export function useResearchQuickActions(): CmdJQuickAction[] {
  const enabled = useAppStore((state) => state.settings?.researchUiEnabled === true)
  const insideProject = useAppStore(selectResearchInsideProject)
  const workspaceId = useAppStore((state) => state.activeWorktreeId)
  const hostId = useAppStore((state) => getResolvedExecutionHostIdForWorktree(state, workspaceId))
  const document = useResearchRecords((state) => state.document)
  const projects = useResearchHomeProjects()
  return useMemo(() => {
    if (!enabled) {
      return []
    }
    const experiments = (document?.experiments ?? []).filter(
      (experiment) =>
        !experiment.archived &&
        experiment.workspaceId === workspaceId &&
        experiment.hostId === hostId
    )
    return buildResearchQuickActions({ projects, experiments, insideProject })
  }, [document, enabled, hostId, insideProject, projects, workspaceId])
}
