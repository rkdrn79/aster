import { useRef, useState } from 'react'
import { ImagePlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { imageSize } from '../../../../research-harness/research-figures-image.mjs'
import type { FigureReference } from './research-figure-recreate'
import {
  RECREATE_HEIGHT_CAP_IN,
  pageSizeText,
  pageSizeWarning,
  recreatePageHeight
} from './research-figure-page-size'
import { useFigurePageSize } from './use-figure-page-size'
import { bytesToBase64 } from './research-project-files'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** An image selected on the canvas when the dialog opened, offered as the reference. */
  selectedImage: FigureReference | null
  /** The page already holds a drawing, which the recreation replaces. */
  hasDrawing: boolean
  /** Resolves to an error message, or null once the agent has the request. */
  onSend: (
    reference: FigureReference,
    matchPage: boolean,
    maxHeightIn: number | null
  ) => Promise<string | null>
}

async function referenceFromFile(file: File): Promise<FigureReference> {
  return { bytes: new Uint8Array(await file.arrayBuffer()), name: file.name || 'reference.png' }
}

/** Recreate from image: paste, drop or choose a published figure; the agent redraws it. */
export function ResearchFigureRecreateDialog({
  open,
  onOpenChange,
  selectedImage,
  hasDrawing,
  onSend
}: Props): React.JSX.Element {
  const [chosen, setChosen] = useState<{ reference: FigureReference; url: string } | null>(null)
  const reference = chosen?.reference ?? null
  const [matchPage, setMatchPage] = useState(true)
  const [capHeight, setCapHeight] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const page = useFigurePageSize()
  const pixels = reference ? imageSize(reference.bytes) : null
  const matched = page && pixels && matchPage ? recreatePageHeight(page.widthIn, pixels) : null
  const capped = matched?.tall && capHeight
  const resultHeight = matched
    ? capped
      ? RECREATE_HEIGHT_CAP_IN
      : matched.heightIn
    : page?.heightIn
  const [sending, setSending] = useState(false)
  const input = useRef<HTMLInputElement | null>(null)

  const choose = (next: FigureReference, type: string): void => {
    setError(null)
    setChosen({ reference: next, url: `data:${type};base64,${bytesToBase64(next.bytes)}` })
  }

  async function pick(file: File | null | undefined): Promise<void> {
    if (file?.type.startsWith('image/')) {
      choose(await referenceFromFile(file), file.type)
    }
  }

  async function send(): Promise<void> {
    if (!reference) {
      return
    }
    setSending(true)
    const failure = await onSend(reference, matchPage, capped ? RECREATE_HEIGHT_CAP_IN : null)
    setSending(false)
    setError(failure)
    if (!failure) {
      setChosen(null)
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-lg"
        onPaste={(event) => {
          const file = Array.from(event.clipboardData.files).find((entry) =>
            entry.type.startsWith('image/')
          )
          if (file) {
            event.preventDefault()
            void pick(file)
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Recreate from image</DialogTitle>
          <DialogDescription>
            The Figure agent redraws a published figure as editable shapes in this figure, keeping
            its layout, colours and text, and compares its preview with the image until they match.
          </DialogDescription>
        </DialogHeader>
        <div
          role="group"
          aria-label="Reference image"
          className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border p-3 text-center text-sm text-muted-foreground"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault()
            void pick(event.dataTransfer.files[0])
          }}
        >
          {chosen ? (
            <img src={chosen.url} alt="Reference figure" className="max-h-56 max-w-full bg-white" />
          ) : (
            <>
              <ImagePlus className="size-5" aria-hidden />
              Paste or drop the figure here
            </>
          )}
          <div className="flex flex-wrap justify-center gap-2">
            <Button size="xs" variant="outline" onClick={() => input.current?.click()}>
              Choose image…
            </Button>
            {selectedImage ? (
              <Button
                size="xs"
                variant="outline"
                onClick={() => choose(selectedImage, 'image/png')}
              >
                Use the selected image
              </Button>
            ) : null}
          </div>
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg"
            aria-label="Reference image file"
            className="hidden"
            onChange={(event) => void pick(event.target.files?.[0])}
          />
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="figure-match-page"
            checked={matchPage}
            onCheckedChange={(value) => setMatchPage(value === true)}
          />
          <Label htmlFor="figure-match-page">Give the page the image&apos;s shape</Label>
        </div>
        {page && resultHeight !== undefined ? (
          <div role="status" className="space-y-1.5 rounded-md bg-muted/60 px-3 py-2 text-xs">
            <p>
              The page will be <strong>{pageSizeText(page.widthIn, resultHeight)}</strong>
              {matched && !capped ? ' (the image’s shape)' : ''}.
            </p>
            {matched?.tall ? (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="figure-cap-height"
                  checked={capHeight}
                  onCheckedChange={(value) => setCapHeight(value === true)}
                />
                <label htmlFor="figure-cap-height" className="text-sm">
                  Cap the height at {RECREATE_HEIGHT_CAP_IN} in (the image’s shape needs{' '}
                  {matched.heightIn} in)
                </label>
              </div>
            ) : null}
            {pageSizeWarning(page.widthIn, resultHeight) ? (
              <p className="text-status-warning">{pageSizeWarning(page.widthIn, resultHeight)}</p>
            ) : null}
            {hasDrawing ? (
              <p className="text-muted-foreground">
                This page has a drawing. Next you choose a new figure, or a redraw that keeps
                the current version in History.
              </p>
            ) : null}
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!reference || sending} onClick={() => void send()}>
            {sending ? 'Sending…' : 'Recreate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
