import { FilePenLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ResearchEmptyState, ResearchPageBody } from './ResearchPageLayout'

/** A project whose main .tex is unset or missing: create one from the template or pick one. */
export function ResearchWritingSetup({
  missingPath,
  canCreate,
  creating,
  error,
  onCreate,
  onChoose
}: {
  /** The configured main file when it does not exist on disk. */
  missingPath: string | null
  canCreate: boolean
  creating: boolean
  error: string | null
  onCreate: () => void
  onChoose: () => void
}): React.JSX.Element {
  return (
    <ResearchPageBody>
      <ResearchEmptyState
        icon={FilePenLine}
        title="Set up the manuscript"
        action={
          <div className="flex flex-wrap justify-center gap-2">
            {canCreate ? (
              <Button size="sm" disabled={creating} onClick={onCreate}>
                {creating ? 'Creating…' : 'Create manuscript'}
              </Button>
            ) : null}
            <Button size="sm" variant={canCreate ? 'outline' : 'default'} onClick={onChoose}>
              Choose main .tex…
            </Button>
          </div>
        }
      >
        {missingPath
          ? `${missingPath} does not exist yet. Create it from a LaTeX template, or choose your paper's main .tex file.`
          : "Choose your paper's main .tex file, or create one from a LaTeX template."}
      </ResearchEmptyState>
      {error ? (
        <p role="alert" className="mt-3 text-center text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </ResearchPageBody>
  )
}
