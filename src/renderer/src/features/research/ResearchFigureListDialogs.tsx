import { useState } from 'react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { figureSlug, isFigureSlug } from '../../../../research-harness/research-figures-model.mjs'

export type RenameRequest = {
  slug: string
  title: string | null
  /** Manuscript lines that include it, and the manuscript's file name for the message. */
  usages: readonly number[]
  manuscript: string | null
}

function lines(count: number): string {
  return count === 1 ? '1 \\includegraphics line' : `${count} \\includegraphics lines`
}

/** Rename: the human title, the file name it gives, and the manuscript lines to update. */
export function ResearchFigureRenameDialog({
  request,
  taken,
  onClose,
  onRename
}: {
  request: RenameRequest
  taken: ReadonlySet<string>
  onClose: () => void
  onRename: (next: {
    slug: string
    title: string | null
    updateManuscript: boolean
  }) => Promise<string | null>
}): React.JSX.Element {
  const [title, setTitle] = useState(request.title ?? request.slug)
  const [file, setFile] = useState<string | null>(null)
  const [update, setUpdate] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const slug = file ?? figureSlug(title)
  const problem = !isFigureSlug(slug)
    ? 'Use letters, digits and dashes for the file name.'
    : slug !== request.slug && taken.has(slug)
      ? `A figure named ${slug} already exists.`
      : null
  const manuscriptName = request.manuscript?.split('/').pop() ?? 'the manuscript'

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    if (problem || busy) {
      return
    }
    setBusy(true)
    const failure = await onRename({
      slug,
      title: title.trim() && title.trim() !== slug ? title.trim() : null,
      updateManuscript: update
    })
    setBusy(false)
    setError(failure)
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rename figure</DialogTitle>
          <DialogDescription>
            The title is what you see here; the file name is what the paper includes.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={(event) => void submit(event)}>
          <div className="space-y-1.5">
            <Label htmlFor="figure-rename-title">Title</Label>
            <Input
              id="figure-rename-title"
              autoFocus
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="figure-rename-file">File name</Label>
            <Input
              id="figure-rename-file"
              value={slug}
              aria-invalid={problem ? true : undefined}
              onChange={(event) => setFile(event.target.value.trim())}
            />
            <p
              className={problem ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}
              role={problem ? 'alert' : undefined}
            >
              {problem ?? `${slug}.excalidraw, with its .svg, .pdf and script`}
            </p>
          </div>
          {request.usages.length && slug !== request.slug ? (
            <div className="flex items-start gap-2">
              <Checkbox
                id="figure-rename-update"
                checked={update}
                onCheckedChange={(value) => setUpdate(value === true)}
              />
              <label htmlFor="figure-rename-update" className="text-sm leading-snug">
                Also update {lines(request.usages.length)} in {manuscriptName} (line{' '}
                {request.usages.join(', ')})
              </label>
            </div>
          ) : null}
          {error ? (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={Boolean(problem) || busy}>
              {busy ? 'Renaming…' : 'Rename'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Delete asks only when the paper uses the figure; otherwise the Undo toast is enough. */
export function ResearchFigureDeleteDialog({
  title,
  usages,
  manuscript,
  onClose,
  onDelete
}: {
  title: string
  usages: readonly number[]
  manuscript: string | null
  onClose: () => void
  onDelete: () => void
}): React.JSX.Element {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete “{title}”?</DialogTitle>
          <DialogDescription>
            {manuscript?.split('/').pop() ?? 'The manuscript'} includes it on line{' '}
            {usages.join(', ')}; the paper will not build until you remove those lines. Its files
            move to the project trash, and you can undo right after.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" autoFocus onClick={onDelete}>
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
