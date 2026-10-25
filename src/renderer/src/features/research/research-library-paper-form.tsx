import { useState } from 'react'
import { FolderOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  ARXIV_ID_PATTERN,
  type LibraryPaper,
  type LibraryScope
} from '../../../../shared/research/research-library'
import { parseArxivReference } from '../../../../shared/research/research-library-arxiv'
import { resolveManuscriptFile } from './research-writing-source'
import { titleFromFileStem } from './research-library-paper-records'

export type PaperDraft = Pick<
  LibraryPaper,
  | 'title'
  | 'authors'
  | 'year'
  | 'venue'
  | 'arxivId'
  | 'doi'
  | 'externalUrl'
  | 'pdfPath'
  | 'abstract'
  | 'tags'
>

type Props = {
  scope: LibraryScope
  paper: LibraryPaper | null
  saving: boolean
  onSave: (draft: PaperDraft) => Promise<void>
  onCancel: () => void
}

export function ResearchLibraryPaperForm({
  scope,
  paper,
  saving,
  onSave,
  onCancel
}: Props): React.JSX.Element {
  const [title, setTitle] = useState(paper?.title ?? '')
  const [authors, setAuthors] = useState(paper?.authors ?? '')
  const [year, setYear] = useState(paper?.year?.toString() ?? '')
  const [venue, setVenue] = useState(paper?.venue ?? '')
  const [arxivId, setArxivId] = useState(paper?.arxivId ?? '')
  const [doi, setDoi] = useState(paper?.doi ?? '')
  const [externalUrl, setExternalUrl] = useState(paper?.externalUrl ?? '')
  const [pdfPath, setPdfPath] = useState(paper?.pdfPath ?? '')
  const [tags, setTags] = useState(paper?.tags.join(', ') ?? '')
  const [abstract, setAbstract] = useState(paper?.abstract ?? '')
  const [error, setError] = useState<string | null>(null)
  const [choosing, setChoosing] = useState(false)
  const canImport = scope.hostId === 'local' && Boolean(window.api.researchLibrary?.importPdf)

  async function choosePdf(): Promise<void> {
    if (choosing) {
      return
    }
    setChoosing(true)
    setError(null)
    try {
      const result = await window.api.researchLibrary.importPdf({
        workspacePath: scope.workspacePath
      })
      if (result.status === 'imported') {
        setPdfPath(result.relativePath)
        if (!title.trim()) {
          setTitle(titleFromFileStem(result.fileStem))
        }
      }
    } catch (cause) {
      setError(String(cause))
    } finally {
      setChoosing(false)
    }
  }

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    setError(null)
    try {
      const parsedYear = year.trim() ? Number(year.trim()) : undefined
      if (
        parsedYear !== undefined &&
        (!Number.isInteger(parsedYear) || parsedYear < 1000 || parsedYear > 9999)
      ) {
        throw new Error('Enter a four-digit publication year.')
      }
      const parsedArxiv = arxivId.trim() ? parseArxivReference(arxivId) : undefined
      if (parsedArxiv === null || (parsedArxiv && !ARXIV_ID_PATTERN.test(parsedArxiv))) {
        throw new Error('Enter an arXiv ID such as 2410.12345.')
      }
      const path = pdfPath.trim()
        ? resolveManuscriptFile(scope, pdfPath, '.pdf').relativePath
        : undefined
      await onSave({
        title: title.trim(),
        authors: authors.trim() || undefined,
        year: parsedYear,
        venue: venue.trim() || undefined,
        arxivId: parsedArxiv,
        doi: doi.trim() || undefined,
        externalUrl: externalUrl.trim() || undefined,
        pdfPath: path,
        abstract: abstract.trim() || undefined,
        tags: [
          ...new Set(
            tags
              .split(',')
              .map((tag) => tag.trim())
              .filter(Boolean)
          )
        ].slice(0, 20)
      })
    } catch (cause) {
      setError(`Paper was not saved. ${String(cause)}`)
    }
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="scrollbar-sleek flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-5"
    >
      <h2 className="text-base font-semibold">{paper ? 'Edit paper' : 'Add paper manually'}</h2>
      <div className="grid gap-4 lg:grid-cols-2">
        <label className="space-y-1 text-xs font-medium lg:col-span-2">
          Title
          <Input
            autoFocus
            required
            maxLength={500}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Paper title"
          />
        </label>
        <label className="space-y-1 text-xs font-medium lg:col-span-2">
          Authors
          <Input
            value={authors}
            onChange={(event) => setAuthors(event.target.value)}
            placeholder="Ada Lovelace, Alan Turing"
          />
        </label>
        <label className="space-y-1 text-xs font-medium">
          Year
          <Input
            inputMode="numeric"
            value={year}
            onChange={(event) => setYear(event.target.value)}
            placeholder="2026"
          />
        </label>
        <label className="space-y-1 text-xs font-medium">
          Venue
          <Input
            value={venue}
            onChange={(event) => setVenue(event.target.value)}
            placeholder="NeurIPS 2025"
          />
        </label>
        <label className="space-y-1 text-xs font-medium">
          arXiv ID
          <Input
            value={arxivId}
            onChange={(event) => setArxivId(event.target.value)}
            placeholder="2410.12345"
          />
        </label>
        <label className="space-y-1 text-xs font-medium">
          DOI
          <Input
            value={doi}
            onChange={(event) => setDoi(event.target.value)}
            placeholder="10.1234/example"
          />
        </label>
        <label className="space-y-1 text-xs font-medium lg:col-span-2">
          Source URL
          <Input
            type="url"
            value={externalUrl}
            onChange={(event) => setExternalUrl(event.target.value)}
            placeholder="https://…"
          />
        </label>
        <label className="space-y-1 text-xs font-medium lg:col-span-2">
          PDF in this project (optional)
          <span className="flex gap-2">
            <Input
              value={pdfPath}
              onChange={(event) => setPdfPath(event.target.value)}
              placeholder=".aster/library/papers/paper.pdf"
              aria-label="Project PDF path"
            />
            {canImport ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={choosing}
                onClick={() => void choosePdf()}
                aria-label="Import a PDF into this project"
              >
                <FolderOpen aria-hidden />
              </Button>
            ) : null}
          </span>
        </label>
        <label className="space-y-1 text-xs font-medium lg:col-span-2">
          Tags
          <Input
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder="baseline, related work, method"
          />
        </label>
        <label className="space-y-1 text-xs font-medium lg:col-span-2">
          Abstract
          <Textarea
            value={abstract}
            onChange={(event) => setAbstract(event.target.value)}
            rows={5}
          />
        </label>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2 border-t border-border pt-4">
        <Button type="submit" size="sm" disabled={saving || !title.trim()}>
          {saving ? 'Saving…' : paper ? 'Save paper' : 'Add to library'}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
