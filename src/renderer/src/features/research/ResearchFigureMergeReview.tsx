import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { describeFigureChange, type FigureMergeConflict } from './research-figure-merge'

type Choice = 'mine' | 'agent'

/** Per element, mine or the agent's, for edits both sides made to the same thing. */
export function ResearchFigureMergeReview({
  open,
  conflicts,
  onOpenChange,
  onApply
}: {
  open: boolean
  conflicts: readonly FigureMergeConflict[]
  onOpenChange: (open: boolean) => void
  onApply: (choices: Record<string, Choice>) => void
}): React.JSX.Element {
  const [picked, setPicked] = useState<Record<string, Choice>>({})
  const choiceFor = (id: string): Choice => picked[id] ?? 'agent'
  const all = (choice: Choice): void =>
    setPicked(Object.fromEntries(conflicts.map((conflict) => [conflict.id, choice])))
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {conflicts.length === 1
              ? 'You and the agent changed the same element'
              : `You and the agent changed the same ${conflicts.length} elements`}
          </DialogTitle>
          <DialogDescription>
            Everything else is merged already. Pick which version to keep for each; the figure is
            saved once you apply.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-1 text-xs">
          <span className="mr-auto text-muted-foreground">Keep for all:</span>
          <Button size="xs" variant="outline" onClick={() => all('mine')}>
            Mine
          </Button>
          <Button size="xs" variant="outline" onClick={() => all('agent')}>
            Agent&apos;s
          </Button>
        </div>
        <ul
          className="scrollbar-sleek max-h-72 space-y-1 overflow-y-auto"
          aria-label="Overlapping edits"
        >
          {conflicts.map((conflict) => (
            <li
              key={conflict.id}
              className="flex items-center gap-3 rounded-md border border-border px-2.5 py-1.5 text-xs"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium" title={conflict.id}>
                  {conflict.label}
                </span>
                <span className="block truncate text-muted-foreground">
                  You: {describeFigureChange(conflict.base, conflict.mine)}
                  {conflict.companions.length ? ` (+${conflict.companions.length} with it)` : ''} ·
                  Agent: {describeFigureChange(conflict.base, conflict.agent)}
                </span>
              </span>
              <RadioGroup
                aria-label={`Keep which version of ${conflict.label}`}
                className="flex shrink-0"
                value={choiceFor(conflict.id)}
                onValueChange={(value) =>
                  setPicked((current) => ({
                    ...current,
                    [conflict.id]: value === 'mine' ? 'mine' : 'agent'
                  }))
                }
              >
                <label className="flex items-center gap-1">
                  <RadioGroupItem value="mine" aria-label="Mine" /> Mine
                </label>
                <label className="flex items-center gap-1">
                  <RadioGroupItem value="agent" aria-label="Agent's" /> Agent&apos;s
                </label>
              </RadioGroup>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
            Later
          </Button>
          <Button
            size="sm"
            onClick={() =>
              onApply(
                Object.fromEntries(
                  conflicts.map((conflict) => [conflict.id, choiceFor(conflict.id)])
                )
              )
            }
          >
            Apply and save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
