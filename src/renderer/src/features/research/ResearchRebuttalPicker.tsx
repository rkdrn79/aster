import { ChevronDown, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import type { RebuttalOwner } from './research-rebuttal-files'
import type { RebuttalSummary } from './research-rebuttal-snapshot'
import { selectRebuttal } from './research-rebuttal-store'

/** Which rebuttal is open, and starting another one. */
export function ResearchRebuttalPicker({
  owner,
  rebuttals,
  selectedSlug,
  onNew
}: {
  owner: RebuttalOwner
  rebuttals: readonly RebuttalSummary[]
  selectedSlug: string | null
  onNew: () => void
}): React.JSX.Element {
  const current = rebuttals.find((entry) => entry.slug === selectedSlug)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="xs" variant="ghost" className="max-w-72">
          <span className="truncate">{current ? current.name : 'No rebuttal'}</span>
          <ChevronDown aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56">
        {rebuttals.map((entry) => (
          <DropdownMenuItem
            key={entry.slug}
            onSelect={() => void selectRebuttal(owner, entry.slug)}
          >
            <span className="min-w-0 flex-1 truncate">{entry.name}</span>
            {entry.venue ? (
              <span className="text-xs text-muted-foreground">{entry.venue}</span>
            ) : null}
          </DropdownMenuItem>
        ))}
        {rebuttals.length ? <DropdownMenuSeparator /> : null}
        <DropdownMenuItem onSelect={onNew}>
          <Plus aria-hidden /> New rebuttal…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
