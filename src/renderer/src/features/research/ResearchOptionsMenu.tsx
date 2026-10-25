import { useEffect, useState } from 'react'
import { FolderInput, FolderTree, MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { isUpstreamOnlySettingsSection } from '@/components/settings/upstream-settings-visibility'
import { selectResearchInsideProject } from './research-navigation'
import { startResearchAdoptInBackground } from './research-adopt-conversation'
import { ResearchLayoutMigrateDialog } from './ResearchLayoutMigrateDialog'
import type { MigratedWorkspace } from './research-layout-migration-records'
import { selectResearchWorkspaceContext } from './research-workspace-context'

/** The current local project when it still keeps records in the pre-ADR-004 research/ tree. */
function useLegacyLayoutWorkspace(): [MigratedWorkspace | null, () => void] {
  const insideProject = useAppStore(selectResearchInsideProject)
  const hostId = useAppStore((state) => selectResearchWorkspaceContext(state).hostId)
  const workspacePath = useAppStore((state) => selectResearchWorkspaceContext(state).workspacePath)
  const [legacy, setLegacy] = useState<MigratedWorkspace | null>(null)
  useEffect(() => {
    setLegacy(null)
    const readCatalog = window.api.researchProjectLayout?.readCatalog
    if (
      !insideProject ||
      hostId !== 'local' ||
      !workspacePath ||
      typeof readCatalog !== 'function'
    ) {
      return
    }
    let active = true
    readCatalog({ workspacePath })
      .then((catalog) => {
        const version =
          typeof catalog === 'object' && catalog !== null && 'schemaVersion' in catalog
            ? catalog.schemaVersion
            : null
        if (active && version === 1) {
          setLegacy({ hostId, workspacePath })
        }
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [insideProject, hostId, workspacePath])
  return [legacy, () => setLegacy(null)]
}

export function ResearchOptionsMenu(): React.JSX.Element {
  const insideProject = useAppStore(selectResearchInsideProject)
  const [legacyWorkspace, clearLegacyWorkspace] = useLegacyLayoutWorkspace()
  const [migrating, setMigrating] = useState<MigratedWorkspace | null>(null)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={translate('research.navigation.tools', 'More options')}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {insideProject ? (
            <>
              <DropdownMenuItem onSelect={() => void startResearchAdoptInBackground()}>
                <FolderTree aria-hidden />
                {translate('research.navigation.adopt', 'Organize with agent in background')}
              </DropdownMenuItem>
              {legacyWorkspace ? (
                <DropdownMenuItem onSelect={() => setMigrating(legacyWorkspace)}>
                  <FolderInput aria-hidden />
                  {translate('research.navigation.migrateLayout', 'Move records to .aster/…')}
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
            </>
          ) : null}
          <DropdownMenuItem onSelect={() => useAppStore.getState().openSettingsPage()}>
            {translate('research.navigation.settings', 'Settings')}
          </DropdownMenuItem>
          {isUpstreamOnlySettingsSection('mobile') ? null : (
            <DropdownMenuItem onSelect={() => useAppStore.getState().openMobilePage()}>
              {translate('research.navigation.mobile', 'Mobile')}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ResearchLayoutMigrateDialog
        workspace={migrating}
        onClose={() => setMigrating(null)}
        onMigrated={clearLegacyWorkspace}
      />
    </>
  )
}
