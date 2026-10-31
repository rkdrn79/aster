import { useState } from 'react'
import { FolderPlus, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { isWebClientLocation } from '@/lib/web-client-location'
import { useAppStore } from '@/store'
import { useResearchHomeProjects } from './research-home-projects'
import { emptyResearchHomeActivity } from './research-home-activity'
import { ResearchProjectCard } from './research-home-project-card'
import { ResearchHomeCompute } from './ResearchHomeCompute'
import { ResearchHomeDeadlines } from './research-deadline-home-card'
import { useDeadlineClock } from './use-deadline-clock'
import { useResearchHomeActivity } from './use-research-home-activity'
import { ResearchEmptyState, ResearchPageBody, ResearchPageHeader } from './ResearchPageLayout'
import { ResearchPhoneAccessDialog } from './ResearchPhoneAccessDialog'

/** The home page keeps projects, deadlines, and compute in one working overview. */
export function ResearchLanding(): React.JSX.Element {
  const projects = useResearchHomeProjects()
  const activity = useResearchHomeActivity(projects)
  const openModal = useAppStore((state) => state.openModal)
  const now = useDeadlineClock(60_000)
  const [phoneAccessOpen, setPhoneAccessOpen] = useState(false)

  return (
    <div className="absolute inset-0 flex flex-col bg-background text-foreground">
      <ResearchPageHeader
        title="Home"
        actions={
          <>
            {isWebClientLocation() ? null : (
              <Button size="sm" variant="ghost" onClick={() => setPhoneAccessOpen(true)}>
                <Smartphone aria-hidden />
                Phone
              </Button>
            )}
            <Button
              size="sm"
              variant={projects.length > 0 ? 'outline' : 'default'}
              onClick={() => openModal('add-repo')}
            >
              <FolderPlus aria-hidden />
              Add project
            </Button>
          </>
        }
      />
      {phoneAccessOpen ? (
        <ResearchPhoneAccessDialog open onClose={() => setPhoneAccessOpen(false)} />
      ) : null}
      <ResearchPageBody>
        <div className="mx-auto grid w-full max-w-7xl min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(19rem,0.8fr)]">
          <section aria-label="Projects" className="min-w-0 space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-semibold">Projects</h2>
              <span className="text-xs tabular-nums text-muted-foreground">
                {projects.length} {projects.length === 1 ? 'project' : 'projects'}
              </span>
            </div>
            <div className="grid min-w-0 content-start gap-3 sm:grid-cols-2">
              {projects.map((project) => (
                <ResearchProjectCard
                  key={project.key}
                  project={project}
                  activity={activity.get(project.key) ?? emptyResearchHomeActivity()}
                  now={now}
                />
              ))}
              {projects.length === 0 ? (
                <div className="sm:col-span-2">
                  <ResearchEmptyState icon={FolderPlus} title="No projects yet">
                    Add the folder or Git repository with your research code.
                  </ResearchEmptyState>
                </div>
              ) : null}
            </div>
          </section>
          <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <ResearchHomeDeadlines />
            <ResearchHomeCompute projects={projects} activity={activity} />
          </div>
        </div>
      </ResearchPageBody>
    </div>
  )
}
