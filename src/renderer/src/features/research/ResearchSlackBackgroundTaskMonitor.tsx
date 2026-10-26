import { useEffect } from 'react'
import { useResearchActiveProject } from './research-home-projects'
import { useResearchSlackBackgroundTasks } from './research-slack-background-tasks'

/** Keeps server Slack coordinators classified while the sidebar and Workbench are closed. */
export function ResearchSlackBackgroundTaskMonitor(): null {
  const { project } = useResearchActiveProject()

  useEffect(() => {
    if (!project) {
      return
    }
    const refresh = (): void => {
      void useResearchSlackBackgroundTasks
        .getState()
        .refresh(project)
        .catch(() => {})
    }
    refresh()
    const timer = setInterval(refresh, 5_000)
    return () => clearInterval(timer)
  }, [project])

  return null
}
