import { MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import type { RebuttalAgentEditMode } from '../../../../research-harness/research-rebuttal-model.mjs'

const MODES: readonly { mode: RebuttalAgentEditMode; label: string; hint: string }[] = [
  {
    mode: 'apply',
    label: 'Apply directly',
    hint: 'Agent edits land in the reply. Undo is one click, and earlier text stays in Versions.'
  },
  {
    mode: 'ask',
    label: 'Ask first',
    hint: 'Edits to a reply that has text wait for you to accept them.'
  }
]

/** Settings for this rebuttal that the person rarely changes. */
export function ResearchRebuttalPageMenu({
  agentEdits,
  readOnly,
  onAgentEditsChange
}: {
  agentEdits: RebuttalAgentEditMode
  readOnly: boolean
  onAgentEditsChange: (mode: RebuttalAgentEditMode) => void
}): React.JSX.Element {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon-xs" variant="ghost" aria-label="Rebuttal settings">
          <MoreHorizontal aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Agent edits</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={agentEdits}
          onValueChange={(value) => {
            const next = MODES.find((entry) => entry.mode === value)
            if (next && next.mode !== agentEdits) {
              onAgentEditsChange(next.mode)
            }
          }}
        >
          {MODES.map((entry) => (
            <DropdownMenuRadioItem
              key={entry.mode}
              value={entry.mode}
              disabled={readOnly}
              className="items-start"
            >
              <span className="flex min-w-0 flex-col gap-0.5">
                <span>{entry.label}</span>
                <span className="text-2xs leading-4 font-normal text-muted-foreground">
                  {entry.hint}
                </span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
