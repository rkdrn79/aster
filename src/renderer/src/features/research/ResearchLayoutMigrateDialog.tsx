import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import type { ResearchLayoutMigration } from '../../../../research-harness/research-migrate.mjs'
import {
  applyLayoutMigrationToRecords,
  type MigratedWorkspace
} from './research-layout-migration-records'

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

/** Shows `migrate --dry-run`, then moves only when the user confirms (ADR-004). */
function MigrateDialogBody({
  workspace,
  onClose,
  onMigrated
}: {
  workspace: MigratedWorkspace
  onClose: () => void
  onMigrated: () => void
}): React.JSX.Element {
  const { workspacePath } = workspace
  const [plan, setPlan] = useState<ResearchLayoutMigration | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [moving, setMoving] = useState(false)

  useEffect(() => {
    let active = true
    window.api.researchProjectLayout
      .migrate({ workspacePath, dryRun: true })
      .then((result) => active && setPlan(result))
      .catch((cause: unknown) => active && setError(errorText(cause)))
    return () => {
      active = false
    }
  }, [workspacePath])

  async function move(): Promise<void> {
    setMoving(true)
    setError(null)
    try {
      const result = await window.api.researchProjectLayout.migrate({
        workspacePath,
        dryRun: false
      })
      // Why: stored Runs and papers still point under research/ until their paths follow the move.
      await applyLayoutMigrationToRecords(workspace, result.moved)
      onMigrated()
      toast.success(
        `Moved ${result.moved.length} item${result.moved.length === 1 ? '' : 's'} to .aster/ and ${result.catalog.manuscript.source}. Review and commit them.`
      )
      onClose()
    } catch (cause) {
      setError(errorText(cause))
      setMoving(false)
    }
  }

  return (
    <DialogContent size="compact">
      <DialogHeader>
        <DialogTitle>Move research records to .aster/</DialogTitle>
        <DialogDescription>
          Aster now keeps its records in .aster/ and the paper outside it. Tracked files move with
          git mv, so git shows renames; nothing is deleted.
        </DialogDescription>
      </DialogHeader>
      {plan ? (
        <ul className="space-y-1 text-xs" aria-label="Planned moves">
          {plan.moved.map((item) => (
            <li key={item.from} className="font-mono">
              {item.from} → {item.to}
            </li>
          ))}
        </ul>
      ) : error ? null : (
        <p className="text-xs text-muted-foreground">Reading the project…</p>
      )}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <DialogFooter>
        <Button variant="ghost" onClick={onClose} disabled={moving}>
          Not now
        </Button>
        <Button onClick={() => void move()} disabled={!plan || moving}>
          {moving ? 'Moving…' : 'Move'}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}

export function ResearchLayoutMigrateDialog({
  workspace,
  onClose,
  onMigrated
}: {
  /** The local project to migrate; null keeps the dialog closed. */
  workspace: MigratedWorkspace | null
  onClose: () => void
  /** Called once the files moved and the stored records follow them. */
  onMigrated: () => void
}): React.JSX.Element {
  return (
    <Dialog open={workspace !== null} onOpenChange={(open) => !open && onClose()}>
      {workspace ? (
        <MigrateDialogBody
          key={workspace.workspacePath}
          workspace={workspace}
          onClose={onClose}
          onMigrated={onMigrated}
        />
      ) : null}
    </Dialog>
  )
}
