import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { answerFigureOverwrite, useFigureOverwritePrompt } from './research-figure-overwrite'

/** Before a redraw replaces a drawing: draw in a new figure (default), redraw, or cancel. */
export function ResearchFigureOverwriteDialog(): React.JSX.Element {
  const pending = useFigureOverwritePrompt((state) => state.pending)
  return (
    <Dialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) {
          answerFigureOverwrite('cancel')
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>This figure already has a drawing</DialogTitle>
          <DialogDescription>
            {pending?.request ?? 'This request'} redraws the whole figure. Draw it in a new figure
            to keep this one as it is, or redraw this one; its current version stays in History.
          </DialogDescription>
        </DialogHeader>
        {/* Why stacked: the Redraw label alone is wider than half the dialog, so a row overflowed. */}
        <DialogFooter className="flex-col sm:flex-col sm:items-stretch">
          <Button size="sm" autoFocus onClick={() => answerFigureOverwrite('new')}>
            Draw in a new figure
          </Button>
          <Button variant="outline" size="sm" onClick={() => answerFigureOverwrite('redraw')}>
            Redraw this figure — current version saved to History
          </Button>
          <Button variant="ghost" size="sm" onClick={() => answerFigureOverwrite('cancel')}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
