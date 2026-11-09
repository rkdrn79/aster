import { useEffect, useState } from 'react'
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
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  figureFilePaths,
  figurePage
} from '../../../../research-harness/research-figures-model.mjs'
import { useFigureEditorHandle } from './research-figure-editor-handle'
import { revealProjectFile } from './research-figure-export-formats'
import { figureBlock, figureUsageLines, manuscriptSections } from './research-figure-paper-block'
import {
  insertFigureInPaper,
  proposedCaption,
  readPaperStatus,
  revealManuscriptLine,
  type PaperStatus
} from './research-figure-paper-insert'
import { pageSizeText } from './research-figure-page-size'
import {
  FigurePublishConflict,
  publishOpenFigure,
  refreshFigureExports,
  toastPublishConflict,
  toastPublished,
  type FigurePublishResult
} from './research-figure-publish'

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

/** Use in paper (⌘⇧L): PDF status, caption and label, and where the block goes. */
export function ResearchFigureUseInPaper({
  open,
  onOpenChange,
  manuscript,
  dirty
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  manuscript: string | null
  dirty: boolean
}): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <UseInPaperForm manuscript={manuscript} dirty={dirty} onClose={() => onOpenChange(false)} />
      ) : null}
    </Dialog>
  )
}

function UseInPaperForm({
  manuscript,
  dirty,
  onClose
}: {
  manuscript: string | null
  dirty: boolean
  onClose: () => void
}): React.JSX.Element | null {
  const handle = useFigureEditorHandle((state) => state.handle)
  const [status, setStatus] = useState<PaperStatus | null>(null)
  const [caption, setCaption] = useState(() => (handle ? proposedCaption(handle.api) : ''))
  const [label, setLabel] = useState(() => `fig:${handle?.target.slug ?? 'figure'}`)
  const [after, setAfter] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [revision, setRevision] = useState(0)
  const target = handle?.target
  useEffect(() => {
    if (!target) {
      return
    }
    let live = true
    void readPaperStatus(target, manuscript, dirty).then((next) => live && setStatus(next))
    return () => {
      live = false
    }
  }, [target, manuscript, dirty, regenerating, revision])
  if (!handle || !target) {
    return null
  }
  const page = figurePage(handle.api.getSceneElements())
  const text = status?.manuscript ?? null
  const sections = text ? manuscriptSections(text) : []
  const usages = text ? figureUsageLines(text, target.slug) : []
  const defaultSection =
    sections.find((section) => /method|approach|model/i.test(section.title)) ?? sections[0]
  const afterLine = after ?? defaultSection?.line ?? null
  const block = figureBlock({ slug: target.slug, widthIn: page?.widthIn, caption, label })
  const pdfPath = figureFilePaths(target.folder, target.slug).pdf
  const { owner } = target
  const copyState = status?.copyState ?? 'none'
  const beside = copyState === 'beside'
  const copyStale = copyState === 'outdated' || copyState === 'missing'

  const regenerate = async (): Promise<void> => {
    setRegenerating(true)
    await refreshFigureExports(handle)
    setRegenerating(false)
  }

  /** Copies the PDF to the paper (never for a figure already beside it); null when it could not. */
  const publish = async (replace = false): Promise<FigurePublishResult | 'beside' | null> => {
    if (beside || !manuscript) {
      return 'beside'
    }
    try {
      const result = await publishOpenFigure(handle, manuscript, replace)
      setRevision((value) => value + 1)
      return result
    } catch (cause) {
      if (cause instanceof FigurePublishConflict) {
        toastPublishConflict(cause, () => publish(true))
      } else {
        toast.error(`The PDF was not copied to the paper. ${errorText(cause)}`)
      }
      return null
    }
  }

  const insert = async (): Promise<void> => {
    if (!manuscript || !text || afterLine === null) {
      return
    }
    setBusy(true)
    try {
      const published = await publish()
      if (published === null) {
        return
      }
      await insertFigureInPaper({
        owner,
        manuscript,
        text,
        block,
        afterLine,
        published: published === 'beside' ? null : published
      })
      onClose()
    } catch (cause) {
      toast.error(`The figure was not inserted. ${errorText(cause)}`)
    } finally {
      setBusy(false)
    }
  }

  const updateInPaper = async (): Promise<void> => {
    setBusy(true)
    try {
      const published = await publish()
      if (published && published !== 'beside') {
        toastPublished(published, 'Updated')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Use in paper</DialogTitle>
        <DialogDescription>Put this figure in the manuscript, or copy its LaTeX.</DialogDescription>
        <div
          role="status"
          className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground"
        >
          {status === null ? (
            'Checking the PDF…'
          ) : status.pdfFresh ? (
            <>
              PDF up to date · vector ·{' '}
              {page ? pageSizeText(page.widthIn, page.heightIn) : 'no page'}
              <Button
                size="xs"
                variant="ghost"
                aria-label="Reveal the PDF"
                onClick={() => revealProjectFile(target.owner, pdfPath)}
              >
                Reveal
              </Button>
            </>
          ) : (
            <>
              {status.hasPdf ? 'PDF outdated' : 'No PDF yet'}
              <Button
                size="xs"
                variant="outline"
                aria-label="Regenerate the PDF"
                disabled={regenerating}
                onClick={() => void regenerate()}
              >
                {regenerating ? 'Saving…' : 'Regenerate'}
              </Button>
            </>
          )}
        </div>
        {status?.copyPath && !beside ? (
          <div
            role="status"
            aria-label="Paper copy"
            className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground"
          >
            {copyState === 'outdated'
              ? 'Paper copy outdated'
              : copyState === 'missing'
                ? 'Paper copy missing'
                : copyState === 'current'
                  ? `Paper copy up to date · ${status.copyPath}`
                  : `Not in the paper yet · Insert copies the PDF to ${status.copyPath}`}
            {copyStale ? (
              <Button
                size="xs"
                variant="outline"
                aria-label="Update in paper"
                disabled={busy}
                onClick={() => void updateInPaper()}
              >
                Update in paper
              </Button>
            ) : null}
          </div>
        ) : null}
      </DialogHeader>
      <div className="space-y-3">
        {usages.length && manuscript ? (
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            Used at line {usages.join(', ')} of {manuscript.split('/').pop()}
            <Button
              size="xs"
              variant="outline"
              aria-label={`Go to line ${usages[0]}`}
              onClick={() => {
                revealManuscriptLine(target.owner, manuscript, usages[0], 0)
                onClose()
              }}
            >
              Go to
            </Button>
          </p>
        ) : null}
        <div className="space-y-1.5">
          <Label htmlFor="figure-caption">Caption</Label>
          <Textarea
            id="figure-caption"
            rows={3}
            value={caption}
            placeholder="What the reader should take from the figure."
            onChange={(event) => setCaption(event.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="figure-label">Label</Label>
            <Input
              id="figure-label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="figure-position">Insert after</Label>
            <select
              id="figure-position"
              value={afterLine ?? ''}
              disabled={!sections.length}
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
              onChange={(event) => setAfter(Number(event.target.value))}
            >
              {sections.length ? null : <option value="">No sections found</option>}
              {sections.map((section) => (
                <option key={section.line} value={section.line}>
                  {`${'  '.repeat(section.level - 1)}§ ${section.title}`}
                </option>
              ))}
            </select>
          </div>
        </div>
        <pre className="scrollbar-sleek max-h-32 overflow-auto rounded-md bg-muted px-2 py-1.5 font-mono text-2xs text-muted-foreground">
          {block}
        </pre>
      </div>
      <DialogFooter>
        <Button
          variant="ghost"
          aria-label="Copy the figure block"
          onClick={() =>
            void publish().then((published) => {
              if (published === null) {
                return
              }
              void window.api.ui
                .writeClipboardText(block)
                .then(() =>
                  toast.success(
                    published === 'beside'
                      ? 'Figure block copied.'
                      : `Figure block copied; the PDF is at ${published.pdf}.`
                  )
                )
            })
          }
        >
          Copy block
        </Button>
        <Button
          aria-label="Insert into the manuscript"
          disabled={!manuscript || !text || afterLine === null || busy || usages.length > 0}
          title={usages.length ? 'The paper already includes this figure.' : undefined}
          onClick={() => void insert()}
        >
          {busy ? 'Inserting…' : 'Insert'}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
