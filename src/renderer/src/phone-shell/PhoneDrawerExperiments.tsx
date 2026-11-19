import { FlaskConical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store'
import { findWorktreeById } from '@/store/slices/worktree-helpers'
import { useCompactDrawer } from '@/app-shell/compact-drawer-store'
import { usePhoneNavigation } from './phone-navigation-store'
import {
  usePhoneResearchOverviewRefresh,
  usePhoneResearchOverviews
} from './phone-research-overviews'

function DrawerNote({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <p className="px-2 text-xs text-muted-foreground">{children}</p>
}

/**
 * The drawer's Experiments on the web client: the workspace's `.aster/` catalog, which the host
 * reads, rather than the desktop's own experiment records that a browser has no copy of.
 */
export function PhoneDrawerExperiments(): React.JSX.Element {
  const worktreeId = useAppStore((state) => state.activeWorktreeId)
  const projectName = useAppStore((state) =>
    worktreeId ? (findWorktreeById(state.worktreesByRepo, worktreeId)?.displayName ?? null) : null
  )
  usePhoneResearchOverviewRefresh(worktreeId ? [worktreeId] : [])
  const overview = usePhoneResearchOverviews((state) =>
    worktreeId ? state.byWorktreeId[worktreeId] : undefined
  )
  if (!worktreeId) {
    return <DrawerNote>Select a workspace to see its experiments.</DrawerNote>
  }
  if (!overview || overview.status === 'loading') {
    return <DrawerNote>Loading experiments…</DrawerNote>
  }
  if (overview.status === 'error') {
    return <DrawerNote>Experiments could not be read. {overview.message}</DrawerNote>
  }
  if (overview.result.experiments.length === 0) {
    return <DrawerNote>No experiments recorded in this project yet.</DrawerNote>
  }
  const open = (slug: string, name: string): void => {
    useCompactDrawer.getState().setOpen(false)
    useAppStore.getState().setActiveView('terminal')
    usePhoneNavigation.getState().push({
      kind: 'experiment',
      worktreeId,
      experiment: slug,
      title: name,
      subtitle: projectName ?? undefined
    })
  }
  return (
    <div className="flex flex-col">
      {overview.result.experiments.map((experiment) => {
        const name = experiment.name || experiment.slug
        return (
          <Button
            key={experiment.slug}
            variant="ghost"
            size="sm"
            className="min-w-0 justify-start"
            onClick={() => open(experiment.slug, name)}
          >
            <FlaskConical aria-hidden />
            <span className="truncate">{name}</span>
          </Button>
        )
      })}
    </div>
  )
}
