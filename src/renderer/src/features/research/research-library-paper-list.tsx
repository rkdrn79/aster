import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { ResearchSegmentedTrack, researchSegmentClass } from './research-segmented-track'
import type { LibraryPaper, PaperReadingStatus } from '../../../../shared/research/research-library'

type StatusFilter = 'all' | PaperReadingStatus

const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'reading', label: 'Reading' },
  { id: 'read', label: 'Read' }
]

/** A paper's status and facts, as small quiet tags under its title (lifted on the open row). */
const PAPER_TAG =
  'inline-flex h-5 items-center rounded-sm bg-muted px-2 group-data-[current=true]/paper:bg-background'

export const STATUS_LABELS: Record<PaperReadingStatus, string> = {
  unread: 'Unread',
  reading: 'Reading',
  read: 'Read'
}

/** Newest additions first; edits never reorder the list under the cursor. */
export function newestFirst(a: LibraryPaper, b: LibraryPaper): number {
  return b.createdAt.localeCompare(a.createdAt)
}

function leadAuthor(authors: string | undefined): string | undefined {
  const names =
    authors
      ?.split(',')
      .map((name) => name.trim())
      .filter(Boolean) ?? []
  return names.length > 1 ? `${names[0]} et al.` : names[0]
}

export function ResearchLibraryPaperList({
  papers,
  highlightCounts,
  selectedPaperId,
  onSelect
}: {
  papers: readonly LibraryPaper[]
  highlightCounts: ReadonlyMap<string, number>
  selectedPaperId: string | null
  onSelect: (paperId: string) => void
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<StatusFilter>('all')
  const visiblePapers = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    return [...papers]
      .filter((paper) => filter === 'all' || paper.status === filter)
      .filter(
        (paper) =>
          !normalized ||
          [
            paper.title,
            paper.authors,
            paper.year?.toString(),
            paper.venue,
            paper.arxivId,
            paper.doi,
            paper.abstract,
            paper.notes,
            ...paper.tags
          ].some((value) => value?.toLocaleLowerCase().includes(normalized))
      )
      .sort(newestFirst)
  }, [papers, query, filter])

  return (
    <aside className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label="Saved papers">
      <div className="space-y-3 border-b border-border p-3">
        <label className="flex items-center gap-2">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search title, notes, tags"
            aria-label="Search papers"
            className="h-8"
          />
        </label>
        <ResearchSegmentedTrack role="group" aria-label="Reading status filter" className="w-full">
          {FILTERS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              aria-pressed={filter === entry.id}
              data-state={filter === entry.id ? 'active' : 'inactive'}
              className={researchSegmentClass(filter === entry.id, 'flex-1 px-2')}
              onClick={() => setFilter(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </ResearchSegmentedTrack>
      </div>
      <div className="scrollbar-sleek min-h-0 flex-1 overflow-auto p-2">
        {visiblePapers.length ? (
          visiblePapers.map((paper) => {
            const current = paper.id === selectedPaperId
            const highlightCount = highlightCounts.get(paper.id) ?? 0
            return (
              <button
                type="button"
                key={paper.id}
                data-current={current}
                className={cn(
                  'group/paper mb-0.5 block w-full rounded-lg px-3 py-3 text-left transition-colors duration-(--duration-fast) hover:bg-accent/70 focus-visible:outline-2 focus-visible:outline-ring',
                  current && 'bg-accent hover:bg-accent'
                )}
                onClick={() => onSelect(paper.id)}
              >
                <span className="flex items-start gap-2">
                  {paper.status === 'unread' ? (
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                  ) : null}
                  <span className="line-clamp-2 text-[13px] leading-snug font-medium">
                    {paper.title}
                  </span>
                </span>
                <span className="mt-1 block truncate text-xs text-muted-foreground">
                  {[leadAuthor(paper.authors), paper.year].filter(Boolean).join(' · ') ||
                    'Citation details missing'}
                </span>
                <span className="mt-2 flex flex-wrap gap-1 text-2xs leading-none text-muted-foreground">
                  <span className={PAPER_TAG}>{STATUS_LABELS[paper.status]}</span>
                  {paper.arxivId ? <span className={PAPER_TAG}>arXiv</span> : null}
                  {paper.pdfPath ? null : <span className={PAPER_TAG}>No PDF</span>}
                  {highlightCount ? (
                    <span className={PAPER_TAG}>
                      {highlightCount} highlight{highlightCount === 1 ? '' : 's'}
                    </span>
                  ) : null}
                </span>
              </button>
            )
          })
        ) : (
          <p className="px-3 py-4 text-sm text-muted-foreground">
            {papers.length ? 'No papers match.' : 'No papers yet.'}
          </p>
        )}
      </div>
    </aside>
  )
}
