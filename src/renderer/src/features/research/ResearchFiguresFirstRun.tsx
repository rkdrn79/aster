import { Plus, Shapes } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ResearchEmptyState } from './ResearchPageLayout'
import type { NewFigureDraft } from './ResearchFigureNewDialog'

const EXAMPLES: readonly { name: string; description: string }[] = [
  {
    name: 'Method overview',
    description:
      'A student and an EMA teacher seeing two views of an image patch grid, meeting at a red loss'
  },
  {
    name: 'Architecture',
    description: 'Encoder → latent → decoder, with the latent drawn as a small token grid'
  },
  {
    name: 'Pipeline',
    description: 'Data, pretraining, fine-tuning and evaluation as four steps left to right'
  }
]

/** The Figures page before the first figure: one way in, and what to ask for. */
export function ResearchFiguresFirstRun({
  onNew
}: {
  onNew: (draft: NewFigureDraft | null) => void
}): React.JSX.Element {
  return (
    <ResearchEmptyState
      icon={Shapes}
      title="Draw your first figure"
      action={
        <div className="flex flex-col items-center gap-4">
          <Button size="sm" aria-label="New figure" onClick={() => onNew(null)}>
            <Plus aria-hidden /> New figure
          </Button>
          <div className="flex max-w-md flex-col items-stretch gap-1.5">
            <p className="text-xs text-muted-foreground">Or describe one, for example:</p>
            {EXAMPLES.map((example) => (
              <button
                key={example.name}
                type="button"
                aria-label={`Describe: ${example.description}`}
                className="rounded-md border border-border bg-background px-3 py-1.5 text-left text-xs text-foreground hover:bg-accent"
                onClick={() =>
                  onNew({ start: 'describe', name: example.name, description: example.description })
                }
              >
                “{example.description}”
              </button>
            ))}
          </div>
        </div>
      }
    >
      Each figure is an .excalidraw file kept with your project records; Use in paper puts its PDF
      next to the manuscript. You edit it by hand; the Figure agent draws into the same file.
    </ResearchEmptyState>
  )
}
