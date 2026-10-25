import { useState } from 'react'
import { toast } from 'sonner'
import { Download } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { extractIpcErrorMessage } from '@/lib/ipc-error'
import { cn } from '@/lib/utils'
import type { ArxivPaperMetadata, LibraryPaper } from '../../../../shared/research/research-library'
import type { DoiPaperMetadata } from '../../../../shared/research/research-library-doi'
import { updateLibraryPaper } from './research-library-paper-records'

type FieldChange = { value: string } | { error: string }

/** Click to edit; Enter or leaving the field saves, Escape keeps the old value. */
function InlineField({
  label,
  value,
  placeholder,
  className,
  wrapperClassName,
  parse,
  onSave
}: {
  label: string
  value: string
  placeholder: string
  className?: string
  /** Width of the field while editing; the Input keeps its own look. */
  wrapperClassName?: string
  parse: (raw: string) => FieldChange
  onSave: (value: string) => Promise<void>
}): React.JSX.Element {
  const [draft, setDraft] = useState<string | null>(null)

  async function commit(raw: string): Promise<void> {
    const change = parse(raw.trim())
    if ('error' in change) {
      toast.error(change.error)
      return
    }
    setDraft(null)
    if (change.value !== value) {
      await onSave(change.value).catch((cause: unknown) =>
        toast.error(`${label} was not saved`, { description: String(cause) })
      )
    }
  }

  if (draft === null) {
    return (
      <button
        type="button"
        aria-label={`Edit ${label.toLowerCase()}`}
        className={cn(
          '-mx-1 rounded-sm px-1 text-left transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring',
          className
        )}
        onClick={() => setDraft(value)}
      >
        {value || <span className="text-muted-foreground">{placeholder}</span>}
      </button>
    )
  }
  return (
    <div className={wrapperClassName}>
      <Input
        autoFocus
        aria-label={label}
        value={draft}
        placeholder={placeholder}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void commit(draft)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            void commit(draft)
          } else if (event.key === 'Escape') {
            event.preventDefault()
            setDraft(null)
          }
        }}
      />
    </div>
  )
}

function fromArxiv(paper: LibraryPaper, metadata: ArxivPaperMetadata): LibraryPaper {
  const authors = metadata.authors.join(', ').slice(0, 2000)
  return {
    ...paper,
    title: metadata.title.slice(0, 500),
    ...(authors ? { authors } : {}),
    ...(metadata.year ? { year: metadata.year } : {}),
    ...(metadata.journalRef ? { venue: metadata.journalRef.slice(0, 200) } : {}),
    ...(metadata.abstract ? { abstract: metadata.abstract.slice(0, 20_000) } : {}),
    arxivId: metadata.arxivId,
    ...(metadata.doi ? { doi: metadata.doi } : {}),
    externalUrl: paper.externalUrl ?? metadata.absUrl,
    tags: paper.tags.length || !metadata.primaryCategory ? paper.tags : [metadata.primaryCategory]
  }
}

function fromDoi(paper: LibraryPaper, metadata: DoiPaperMetadata): LibraryPaper {
  const authors = metadata.authors.join(', ').slice(0, 2000)
  return {
    ...paper,
    title: metadata.title.slice(0, 500),
    ...(authors ? { authors } : {}),
    ...(metadata.year ? { year: metadata.year } : {}),
    ...(metadata.venue ? { venue: metadata.venue.slice(0, 200) } : {}),
    ...(metadata.abstract ? { abstract: metadata.abstract.slice(0, 20_000) } : {}),
    doi: metadata.doi,
    ...(paper.externalUrl || !metadata.url ? {} : { externalUrl: metadata.url })
  }
}

/** Fills citation details from the arXiv ID or DOI found in the PDF, only when the user asks. */
function FillDetailsButton({ paper }: { paper: LibraryPaper }): React.JSX.Element | null {
  const [busy, setBusy] = useState(false)
  const lookupDoi = window.api.researchLibrary?.lookupDoi
  const source = paper.arxivId ? 'arXiv' : paper.doi && lookupDoi ? 'DOI' : null
  if (!source || (paper.authors && paper.abstract)) {
    return null
  }

  async function fill(): Promise<void> {
    setBusy(true)
    try {
      if (paper.arxivId) {
        const metadata = await window.api.researchLibrary.lookupArxiv({ reference: paper.arxivId })
        await updateLibraryPaper(paper.id, (current) => fromArxiv(current, metadata))
      } else if (paper.doi && lookupDoi) {
        const metadata = await lookupDoi({ reference: paper.doi })
        await updateLibraryPaper(paper.id, (current) => fromDoi(current, metadata))
      }
      toast.success(`Details filled from ${source}`)
    } catch (cause) {
      toast.error(`Details were not filled from ${source}`, {
        description: extractIpcErrorMessage(cause, 'The lookup failed.')
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button size="xs" variant="outline" disabled={busy} onClick={() => void fill()}>
      <Download aria-hidden />
      {busy ? 'Filling…' : `Fill from ${source}`}
    </Button>
  )
}

function parseYear(raw: string): FieldChange {
  if (!raw) {
    return { value: '' }
  }
  const year = Number(raw)
  return /^\d{4}$/.test(raw) && year >= 1000
    ? { value: raw }
    : { error: 'Enter a four-digit year.' }
}

export function ResearchLibraryPaperHeader({ paper }: { paper: LibraryPaper }): React.JSX.Element {
  const save = (change: (current: LibraryPaper) => LibraryPaper): Promise<void> =>
    updateLibraryPaper(paper.id, change)
  const eyebrow = [paper.arxivId ? `arXiv:${paper.arxivId}` : null, paper.venue]
    .filter(Boolean)
    .join(' · ')
  return (
    <header className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{eyebrow || 'Reference'}</p>
      <InlineField
        label="Title"
        value={paper.title}
        placeholder="Add a title"
        className="block w-full text-base font-semibold leading-snug"
        wrapperClassName="w-full"
        parse={(raw) => (raw ? { value: raw.slice(0, 500) } : { error: 'A paper needs a title.' })}
        onSave={(title) => save((current) => ({ ...current, title }))}
      />
      <div className="flex min-w-0 items-baseline gap-1.5 text-xs">
        <InlineField
          label="Authors"
          value={paper.authors ?? ''}
          placeholder="Add authors"
          className="min-w-0 flex-1 truncate"
          wrapperClassName="min-w-0 flex-1"
          parse={(raw) => ({ value: raw.slice(0, 2000) })}
          onSave={(authors) => save((current) => ({ ...current, authors: authors || undefined }))}
        />
        <InlineField
          label="Year"
          value={paper.year ? String(paper.year) : ''}
          placeholder="Year"
          className="shrink-0 tabular-nums text-muted-foreground"
          wrapperClassName="w-20 shrink-0"
          parse={parseYear}
          onSave={(year) =>
            save((current) => ({ ...current, year: year ? Number(year) : undefined }))
          }
        />
      </div>
      {paper.tags.length ? (
        <div className="flex flex-wrap gap-1 pt-1">
          {paper.tags.map((tag) => (
            <Badge key={tag} variant="secondary">
              {tag}
            </Badge>
          ))}
        </div>
      ) : null}
      <div className="pt-1 empty:hidden">
        <FillDetailsButton paper={paper} />
      </div>
    </header>
  )
}
