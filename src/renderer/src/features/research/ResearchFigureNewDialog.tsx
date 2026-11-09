import { useState } from 'react'
import {
  ChartLine,
  ImagePlus,
  LayoutTemplate,
  MessageSquareText,
  ScrollText,
  Square
} from 'lucide-react'
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
import { cn } from '@/lib/utils'
import {
  figureSlug,
  type FigureSize
} from '../../../../research-harness/research-figures-model.mjs'
import { FIGURE_TEMPLATES, type FigureStart } from './research-figure-chat-send'
import { PAGE_WIDTHS, parseInches } from './research-figure-page-size'

export type NewFigureRequest = {
  name: string
  slug: string
  size: FigureSize
  start: FigureStart
  description: string
  template: string
}

/** What the dialog opens with, e.g. an example prompt from the first-run page. */
export type NewFigureDraft = { start?: FigureStart; description?: string; name?: string }

const STARTS: readonly { id: FigureStart; label: string; detail: string; icon: typeof Square }[] = [
  { id: 'blank', label: 'Blank', detail: 'An empty page', icon: Square },
  { id: 'describe', label: 'Describe it', detail: 'Say what to draw', icon: MessageSquareText },
  { id: 'method', label: 'Method section', detail: 'Drawn from the paper', icon: ScrollText },
  { id: 'template', label: 'Template', detail: 'Transformer, CLIP, U-Net…', icon: LayoutTemplate },
  { id: 'image', label: 'Image', detail: 'Recreate a published figure', icon: ImagePlus },
  { id: 'plot', label: 'Plot from Runs', detail: 'A matplotlib plot', icon: ChartLine }
]
const HEIGHTS: Record<string, number> = { single: 2, onehalf: 2.5, double: 2.5 }
const SUBMIT: Record<FigureStart, string> = {
  blank: 'Create figure',
  describe: 'Create and describe',
  method: 'Create and draw',
  template: 'Create from template',
  image: 'Create and choose image',
  plot: 'Ask for the plot'
}

type Props = {
  open: boolean
  folder: string | null
  /** File names of the figures already there, for the live duplicate check. */
  existing: ReadonlySet<string>
  draft: NewFigureDraft | null
  onOpenChange: (open: boolean) => void
  onOpenExisting: (slug: string) => void
  /** Resolves to an error message, or null once created (and the start sent). */
  onCreate: (request: NewFigureRequest) => Promise<string | null>
}

/** New figure: a name, where to start from, and the printed size. */
export function ResearchFigureNewDialog(props: Props): React.JSX.Element {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      {props.open ? <NewFigureForm {...props} /> : null}
    </Dialog>
  )
}

function NewFigureForm({
  folder,
  existing,
  draft,
  onOpenChange,
  onOpenExisting,
  onCreate
}: Props): React.JSX.Element {
  const [name, setName] = useState(draft?.name ?? '')
  const [start, setStart] = useState<FigureStart>(draft?.start ?? 'blank')
  const [description, setDescription] = useState(draft?.description ?? '')
  const [template, setTemplate] = useState(FIGURE_TEMPLATES[0].id)
  const [width, setWidth] = useState<string>('single')
  const [custom, setCustom] = useState({ width: '5.5', height: '3' })
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const slug = figureSlug(name)
  const named = name.trim().length > 0
  const duplicate = named && existing.has(slug)
  const preset = PAGE_WIDTHS.find((entry) => entry.id === width)
  const customSize = { width: parseInches(custom.width), height: parseInches(custom.height) }
  const size: FigureSize | null = preset
    ? { widthIn: preset.widthIn, heightIn: HEIGHTS[preset.id] ?? 2.5 }
    : customSize.width && customSize.height
      ? { widthIn: customSize.width, heightIn: customSize.height }
      : null
  const missing = !named || !size || duplicate || (start === 'describe' && !description.trim())

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    if (missing || !size || creating) {
      return
    }
    setCreating(true)
    const failure = await onCreate({ name: name.trim(), slug, size, start, description, template })
    setCreating(false)
    setError(failure)
    if (!failure) {
      onOpenChange(false)
    }
  }

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>New figure</DialogTitle>
        <DialogDescription>
          The page is the printed size, so text keeps its point size in the paper.
        </DialogDescription>
      </DialogHeader>
      <form className="space-y-4" onSubmit={(event) => void submit(event)}>
        <div className="space-y-1.5">
          <Label htmlFor="figure-name">Name</Label>
          <Input
            id="figure-name"
            autoFocus
            value={name}
            placeholder="Method overview"
            aria-invalid={duplicate ? true : undefined}
            aria-describedby="figure-name-hint"
            onChange={(event) => setName(event.target.value)}
          />
          <div id="figure-name-hint" className="min-h-4 text-xs">
            {duplicate ? (
              <span role="alert" className="flex flex-wrap items-center gap-1.5 text-destructive">
                A figure named {slug} already exists.
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  aria-label={`Open existing figure ${slug}`}
                  onClick={() => {
                    onOpenExisting(slug)
                    onOpenChange(false)
                  }}
                >
                  Open existing
                </Button>
              </span>
            ) : named && folder && start !== 'plot' ? (
              <span className="text-muted-foreground">
                {folder}/{slug}.excalidraw, with .svg and .pdf beside it
              </span>
            ) : named && folder ? (
              <span className="text-muted-foreground">
                {folder}/{slug}.py and {slug}.pdf
              </span>
            ) : null}
          </div>
        </div>
        <fieldset className="space-y-1.5">
          <legend className="mb-1.5 text-sm font-medium">Start from</legend>
          <div role="radiogroup" aria-label="Start from" className="grid grid-cols-3 gap-1.5">
            {STARTS.map((entry) => {
              const Icon = entry.icon
              const checked = start === entry.id
              return (
                <button
                  key={entry.id}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  aria-label={entry.label}
                  className={cn(
                    'flex flex-col items-start gap-0.5 rounded-md border border-border px-2 py-1.5 text-left hover:bg-accent',
                    checked && 'border-foreground/60 bg-accent'
                  )}
                  onClick={() => setStart(entry.id)}
                >
                  <span className="flex items-center gap-1.5 text-xs font-medium">
                    <Icon className="size-3.5 text-muted-foreground" aria-hidden />
                    {entry.label}
                  </span>
                  <span className="text-2xs text-muted-foreground">{entry.detail}</span>
                </button>
              )
            })}
          </div>
        </fieldset>
        {start === 'describe' ? (
          <div className="space-y-1.5">
            <Label htmlFor="figure-description">What should it show?</Label>
            <Textarea
              id="figure-description"
              rows={3}
              value={description}
              placeholder="e.g. a student and an EMA teacher meeting at a red loss, image patches on the left"
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
        ) : null}
        {start === 'template' ? (
          <div className="space-y-1.5">
            <Label htmlFor="figure-template">Template</Label>
            <select
              id="figure-template"
              value={template}
              className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm"
              onChange={(event) => setTemplate(event.target.value)}
            >
              {FIGURE_TEMPLATES.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}: {entry.detail}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {start === 'plot' ? null : (
          <fieldset className="space-y-1.5">
            <legend className="mb-1.5 text-sm font-medium">Size</legend>
            <div
              role="radiogroup"
              aria-label="Figure size"
              className="flex flex-wrap items-center gap-1.5"
            >
              {[...PAGE_WIDTHS, { id: 'custom', label: 'Custom', widthIn: 0 }].map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  role="radio"
                  aria-checked={width === entry.id}
                  aria-label={entry.id === 'custom' ? 'Custom size' : `${entry.label} column`}
                  className={cn(
                    'rounded-md border border-border px-2 py-1 text-xs hover:bg-accent',
                    width === entry.id && 'border-foreground/60 bg-accent'
                  )}
                  onClick={() => setWidth(entry.id)}
                >
                  {entry.label}
                  {entry.widthIn ? (
                    <span className="ml-1 text-muted-foreground">
                      {entry.widthIn} × {HEIGHTS[entry.id]} in
                    </span>
                  ) : null}
                </button>
              ))}
              {width === 'custom' ? (
                <span className="flex items-center gap-1 text-xs">
                  <Input
                    aria-label="Width in inches"
                    className="h-7 w-16"
                    value={custom.width}
                    onChange={(event) => setCustom({ ...custom, width: event.target.value })}
                  />
                  ×
                  <Input
                    aria-label="Height in inches"
                    className="h-7 w-16"
                    value={custom.height}
                    onChange={(event) => setCustom({ ...custom, height: event.target.value })}
                  />
                  in
                </span>
              ) : null}
            </div>
          </fieldset>
        )}
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={missing || creating}>
            {creating ? 'Creating…' : SUBMIT[start]}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}
