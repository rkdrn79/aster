import { useState } from 'react'
import { ChevronDown, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { useFigureEditorHandle } from './research-figure-editor-handle'
import { applyPageSize, fitPageHeight } from './research-figure-page-apply'
import { useFigurePageSize } from './use-figure-page-size'
import {
  PAGE_VENUES,
  PAGE_WIDTHS,
  formatInches,
  pageSizeText,
  pageSizeWarning,
  parseInches
} from './research-figure-page-size'

function PageSizeForm({
  current,
  onDone
}: {
  current: { widthIn: number; heightIn: number }
  onDone: () => void
}): React.JSX.Element {
  const [width, setWidth] = useState(formatInches(current.widthIn))
  const [height, setHeight] = useState<string | null>(null)
  const [mode, setMode] = useState<'keep' | 'scale'>('keep')
  const widthIn = parseInches(width)
  const widthChanged = widthIn !== null && widthIn !== current.widthIn
  const scaledHeight =
    widthIn && mode === 'scale' ? (current.heightIn * widthIn) / current.widthIn : current.heightIn
  const heightIn = height === null ? Math.round(scaledHeight * 100) / 100 : parseInches(height)
  const changed =
    widthIn !== null && heightIn !== null && (widthChanged || heightIn !== current.heightIn)
  const warning = widthIn && heightIn ? pageSizeWarning(widthIn, heightIn) : null

  function apply(): void {
    const api = useFigureEditorHandle.getState().handle?.api
    if (api && widthIn && heightIn) {
      applyPageSize(api, { widthIn, heightIn }, widthChanged ? mode : 'keep')
      onDone()
    }
  }

  return (
    <form
      className="space-y-3 p-3"
      onSubmit={(event) => {
        event.preventDefault()
        apply()
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="figure-page-width">Width</Label>
        <div role="radiogroup" aria-label="Page width" className="flex flex-wrap gap-1">
          {PAGE_WIDTHS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="radio"
              aria-checked={widthIn === entry.widthIn}
              aria-label={`${entry.label} column, ${entry.widthIn} in`}
              className={cn(
                'rounded-md border border-border px-2 py-0.5 text-xs hover:bg-accent',
                widthIn === entry.widthIn && 'border-foreground/60 bg-accent'
              )}
              onClick={() => setWidth(String(entry.widthIn))}
            >
              {entry.label} <span className="text-muted-foreground">{entry.widthIn}</span>
            </button>
          ))}
          <Input
            id="figure-page-width"
            aria-label="Custom width in inches"
            className="h-6 w-16"
            value={width}
            onChange={(event) => setWidth(event.target.value)}
          />
        </div>
        <select
          aria-label="Venue preset"
          value=""
          className="h-7 w-full rounded-md border border-border bg-background px-1.5 text-xs"
          onChange={(event) => event.target.value && setWidth(event.target.value)}
        >
          <option value="">Venue preset…</option>
          {PAGE_VENUES.flatMap((venue) => [
            ...(venue.single
              ? [
                  <option key={`${venue.id}-single`} value={venue.single}>
                    {venue.label} · column {venue.single} in
                  </option>
                ]
              : []),
            <option key={`${venue.id}-double`} value={venue.double}>
              {venue.label} · {venue.single ? 'full width' : 'text width'} {venue.double} in
            </option>
          ])}
        </select>
      </div>
      {widthChanged ? (
        <div
          role="radiogroup"
          aria-label="When the width changes"
          className="flex flex-col gap-1 text-xs"
        >
          {(
            [
              ['keep', 'Keep content size', 'centre the drawing on the new page'],
              ['scale', 'Scale (keep text pt)', 'shapes grow or shrink, text stays the same size']
            ] as const
          ).map(([value, label, detail]) => (
            <label key={value} className="flex cursor-pointer items-start gap-1.5">
              <input
                type="radio"
                name="figure-page-mode"
                className="mt-0.5"
                checked={mode === value}
                onChange={() => {
                  setMode(value)
                  setHeight(null)
                }}
              />
              <span>
                {label} <span className="text-muted-foreground">· {detail}</span>
              </span>
            </label>
          ))}
        </div>
      ) : null}
      <div className="flex items-end gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="figure-page-height">Height</Label>
          <Input
            id="figure-page-height"
            className="h-7 w-20"
            value={height ?? formatInches(scaledHeight)}
            onChange={(event) => setHeight(event.target.value)}
          />
        </div>
        <Button
          type="button"
          size="xs"
          variant="outline"
          aria-label="Fit the page height to the drawing"
          onClick={() => {
            const api = useFigureEditorHandle.getState().handle?.api
            if (api && fitPageHeight(api) !== null) {
              onDone()
            }
          }}
        >
          Fit to content
        </Button>
      </div>
      {warning ? (
        <p role="status" className="flex items-start gap-1 text-xs text-status-warning">
          <TriangleAlert className="mt-0.5 size-3 shrink-0" aria-hidden /> {warning}
        </p>
      ) : null}
      <div className="flex justify-end gap-1">
        <Button type="button" size="xs" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" size="xs" disabled={!changed}>
          Apply
        </Button>
      </div>
    </form>
  )
}

/** The toolbar chip "3.25 × 2 in ▾": width presets, venues, height and Fit to content. */
export function ResearchFigurePageControl({
  open,
  onOpenChange
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}): React.JSX.Element | null {
  const page = useFigurePageSize()
  if (!page) {
    return null
  }
  const warning = pageSizeWarning(page.widthIn, page.heightIn)
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          size="xs"
          variant="ghost"
          aria-label={`Page size ${pageSizeText(page.widthIn, page.heightIn)}`}
          title={warning ?? 'Printed page size'}
        >
          {warning ? <TriangleAlert className="text-status-warning" aria-hidden /> : null}
          <span className="tabular-nums">{pageSizeText(page.widthIn, page.heightIn)}</span>
          <ChevronDown aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <PageSizeForm current={page} onDone={() => onOpenChange(false)} />
      </PopoverContent>
    </Popover>
  )
}
