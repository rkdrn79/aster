import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { extractIpcErrorMessage } from '@/lib/ipc-error'
import type { ArxivPaperMetadata, LibraryScope } from '../../../../shared/research/research-library'
import { useResearchLibrary } from './research-library-store'
import {
  addLibraryPaper,
  findPaperByArxivId,
  paperFromArxiv
} from './research-library-paper-records'
import { canDownloadLibraryPdf, downloadLibraryArxivPdf } from './research-library-pdf-download'

const AUTHORS_SHOWN = 6

export function ResearchLibraryArxivDialog({
  scope,
  open,
  onOpenChange,
  onOpenPaper
}: {
  scope: LibraryScope
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpenPaper: (paperId: string) => void
}): React.JSX.Element {
  const [reference, setReference] = useState('')
  const [metadata, setMetadata] = useState<ArxivPaperMetadata | null>(null)
  const [busy, setBusy] = useState<'lookup' | 'add' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const papers = useResearchLibrary((state) => state.document?.papers)
  const existing = metadata ? findPaperByArxivId(papers ?? [], scope, metadata.arxivId) : undefined
  const canDownload = canDownloadLibraryPdf(scope)

  function close(): void {
    onOpenChange(false)
    setReference('')
    setMetadata(null)
    setError(null)
  }

  async function lookup(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    if (busy || !reference.trim()) {
      return
    }
    setBusy('lookup')
    setError(null)
    setMetadata(null)
    try {
      setMetadata(await window.api.researchLibrary.lookupArxiv({ reference }))
    } catch (cause) {
      setError(extractIpcErrorMessage(cause, 'arXiv lookup failed.'))
    } finally {
      setBusy(null)
    }
  }

  async function add(): Promise<void> {
    if (!metadata || busy) {
      return
    }
    setBusy('add')
    setError(null)
    let pdfPath: string | undefined
    let pdfError: string | null = null
    if (canDownload) {
      try {
        pdfPath = (await downloadLibraryArxivPdf(scope, metadata.arxivId)).relativePath
      } catch (cause) {
        pdfError = extractIpcErrorMessage(cause, 'The PDF download failed.')
      }
    }
    try {
      const paper = paperFromArxiv(scope, metadata, pdfPath)
      await addLibraryPaper(paper)
      if (pdfError) {
        toast.error('Paper added without its PDF', { description: pdfError })
      }
      onOpenPaper(paper.id)
      close()
    } catch (cause) {
      setError(`Paper was not added. ${String(cause)}`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add from arXiv</DialogTitle>
          <DialogDescription>
            Paste an arXiv ID or an arXiv, alphaXiv, or Hugging Face Papers link.
            {canDownload ? " The PDF is saved in this project's Library folder." : ''}
          </DialogDescription>
        </DialogHeader>
        <form className="flex gap-2" onSubmit={(event) => void lookup(event)}>
          <Input
            autoFocus
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            placeholder="2410.12345 or https://arxiv.org/abs/…"
            aria-label="arXiv ID or link"
          />
          <Button type="submit" variant="outline" disabled={busy !== null || !reference.trim()}>
            {busy === 'lookup' ? 'Looking up…' : 'Look up'}
          </Button>
        </form>
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
        {metadata ? (
          <article className="max-h-[50vh] overflow-auto rounded-lg border border-border p-4 scrollbar-sleek">
            <p className="text-xs font-medium text-muted-foreground">
              arXiv:{metadata.arxivId}
              {metadata.primaryCategory ? ` · ${metadata.primaryCategory}` : ''}
              {metadata.year ? ` · ${metadata.year}` : ''}
            </p>
            <h3 className="mt-1 text-sm font-semibold leading-snug">{metadata.title}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {metadata.authors.slice(0, AUTHORS_SHOWN).join(', ')}
              {metadata.authors.length > AUTHORS_SHOWN
                ? ` and ${metadata.authors.length - AUTHORS_SHOWN} more`
                : ''}
            </p>
            {metadata.abstract ? (
              <p className="mt-3 line-clamp-6 text-xs leading-relaxed">{metadata.abstract}</p>
            ) : null}
          </article>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          {existing ? (
            <Button
              onClick={() => {
                onOpenPaper(existing.id)
                close()
              }}
            >
              Open saved paper
            </Button>
          ) : (
            <Button disabled={!metadata || busy !== null} onClick={() => void add()}>
              {busy === 'add' ? (canDownload ? 'Downloading PDF…' : 'Adding…') : 'Add to library'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
