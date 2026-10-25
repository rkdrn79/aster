import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import type { SubmissionStatus } from '../../../../shared/research/conference-deadlines'
import type { EditionStatus } from './research-deadline-timeline'

const STATUS_LABEL: Record<SubmissionStatus, string> = {
  submitted: 'Submitted',
  accepted: 'Accepted',
  rejected: 'Rejected'
}

type Props = {
  status: EditionStatus
  title: string
  /** Offer "Mark submitted" on this row; other rows of an unsubmitted paper stay quiet. */
  offerSubmit: boolean
  disabled?: boolean
  onChange: (status: SubmissionStatus | null) => void
}

export function ResearchDeadlineStatusMenu({
  status,
  title,
  offerSubmit,
  disabled,
  onChange
}: Props): React.JSX.Element | null {
  if (status === 'none') {
    return offerSubmit ? (
      <Button
        variant="outline"
        size="xs"
        disabled={disabled}
        aria-label={`Mark ${title} as submitted`}
        onClick={() => onChange('submitted')}
      >
        Mark submitted
      </Button>
    ) : null
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="secondary"
          size="xs"
          disabled={disabled}
          aria-label={`${title} paper status: ${STATUS_LABEL[status]}`}
        >
          {STATUS_LABEL[status]}
          <ChevronDown aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={status}
          onValueChange={(value) => {
            if (value === 'submitted' || value === 'accepted' || value === 'rejected') {
              onChange(value)
            }
          }}
        >
          <DropdownMenuRadioItem value="submitted">Submitted</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="accepted">Accepted</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="rejected">Rejected</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onChange(null)}>Not submitted</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
