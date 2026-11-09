import { ChevronDown, CloudDownload, FileText, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import type { RebuttalSnapshot } from './research-rebuttal-snapshot'

/** Where the reviews came from, and importing again: once reviews are in, this is all that remains. */
export function ResearchRebuttalReviewsMenu({
  snapshot,
  onImportAgain,
  onAddReviewer
}: {
  snapshot: RebuttalSnapshot
  onImportAgain: () => void
  onAddReviewer: () => void
}): React.JSX.Element {
  const { meta } = snapshot.bundle
  const fromOpenReview = meta.reviewers.some((reviewer) => reviewer.source === 'openreview')
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="xs" variant="ghost">
          <FileText aria-hidden />
          {meta.reviewers.length} {meta.reviewers.length === 1 ? 'review' : 'reviews'}
          {fromOpenReview ? ' · OpenReview' : ''}
          <ChevronDown aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        <DropdownMenuLabel>{meta.forum ? `From ${meta.forum}` : 'Added by hand'}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onImportAgain}>
          <CloudDownload aria-hidden /> Import again from OpenReview…
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onAddReviewer}>
          <Plus aria-hidden /> Add a reviewer…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
