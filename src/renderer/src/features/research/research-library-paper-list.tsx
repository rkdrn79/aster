import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { LibraryPaper, PaperReadingStatus } from '../../../../shared/research/research-library'

type StatusFilter = 'all' | PaperReadingStatus

const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'reading', label: 'Reading' },
  { id: 'read', label: 'Read' }
]

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
      <div className="space-y-2 border-b border-border p-3">
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
        <div className="flex gap-1" role="group" aria-label="Reading status filter">
          {FILTERS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              aria-pressed={filter === entry.id}
              className={cn(
                'rounded-md px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring',
                filter === entry.id && 'bg-accent text-foreground'
              )}
              onClick={() => setFilter(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </div>
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
                  'mb-1 block w-full rounded-md px-3 py-2 text-left transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring',
                  current && 'bg-accent'
                )}
                onClick={() => onSelect(paper.id)}
              >
                <span className="flex items-start gap-2">
                  {paper.status === 'unread' ? (
                    <span
                      className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary"
                      aria-hidden
                    />
                  ) : null}
                  <span className="line-clamp-2 text-sm font-medium leading-snug">
                    {paper.title}
                  </span>
                </span>
                <span className="mt-1 block truncate text-xs text-muted-foreground">
                  {[leadAuthor(paper.authors), paper.year].filter(Boolean).join(' · ') ||
                    'Citation details missing'}
                </span>
                <span className="mt-1 flex gap-2 text-2xs text-muted-foreground">
                  <span>{STATUS_LABELS[paper.status]}</span>
                  {paper.arxivId ? <span>arXiv</span> : null}
                  {paper.pdfPath ? null : <span>No PDF</span>}
                  {highlightCount ? (
                    <span>
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
