import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Check, Layers, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { FigureTarget } from './research-figures-export'
import {
  adoptFigureVariant,
  discardFigureVariants,
  readFigureVariants,
  type FigureVariant
} from './research-figure-variants'

const POLL_MS = 2500
const THUMB_PX = 360

type Shown = FigureVariant & { url: string | null }

/**
 * The agent's three variants above the canvas: 1/2/3 previews one, Enter adopts it (the current
 * version stays in History), Esc discards them all.
 */
export function ResearchFigureVariantStrip({
  target
}: {
  target: FigureTarget
}): React.JSX.Element | null {
  const [variants, setVariants] = useState<Shown[]>([])
  const [previewing, setPreviewing] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const stripRef = useRef<HTMLDivElement | null>(null)
  const signature = variants.map((variant) => `${variant.name}:${variant.text.length}`).join('|')
  const signatureRef = useRef('')

  useEffect(() => {
    let live = true
    const poll = async (): Promise<void> => {
      const found = await readFigureVariants(target).catch(() => [])
      const next = found.map((variant) => `${variant.name}:${variant.text.length}`).join('|')
      if (!live || next === signatureRef.current) {
        return
      }
      signatureRef.current = next
      const { figureVersionDataUrl } = await import('./research-figure-history-render')
      const shown = await Promise.all(
        found.map(async (variant) => ({
          ...variant,
          url: await figureVersionDataUrl(variant.text, THUMB_PX).catch(() => null)
        }))
      )
      if (live) {
        setVariants(shown)
      }
    }
    void poll()
    const timer = window.setInterval(() => void poll(), POLL_MS)
    return () => {
      live = false
      window.clearInterval(timer)
    }
  }, [target])

  useEffect(() => {
    if (signature) {
      stripRef.current?.focus()
    }
  }, [signature])

  if (!variants.length) {
    return null
  }
  const current = previewing === null ? null : (variants[previewing] ?? null)

  async function adopt(variant: Shown): Promise<void> {
    setBusy(true)
    const failure = await adoptFigureVariant(target, variant)
    setBusy(false)
    if (failure) {
      toast.error(failure)
      return
    }
    toast.success(`Adopted variant ${variant.name.slice(1)}.`, {
      description: 'The version it replaced is in History.'
    })
    signatureRef.current = ''
    setVariants([])
    setPreviewing(null)
  }

  async function discard(): Promise<void> {
    setBusy(true)
    await discardFigureVariants(target).catch(() => undefined)
    setBusy(false)
    signatureRef.current = ''
    setVariants([])
    setPreviewing(null)
    toast.message('Discarded the variants.')
  }

  return (
    <div
      ref={stripRef}
      role="region"
      aria-label="Figure variants"
      tabIndex={0}
      className="shrink-0 border-b border-border bg-muted/30 px-3 py-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onKeyDown={(event) => {
        const index = ['1', '2', '3'].indexOf(event.key)
        if (index !== -1 && variants[index]) {
          event.preventDefault()
          setPreviewing(index)
        } else if (event.key === 'Enter' && current) {
          event.preventDefault()
          void adopt(current)
        } else if (event.key === 'Escape') {
          event.preventDefault()
          void discard()
        }
      }}
    >
      <div className="flex items-center gap-2">
        <Layers className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="shrink-0 font-medium">Variants</span>
        <div
          className="flex min-w-0 items-center gap-1.5"
          role="group"
          aria-label="Preview a variant"
        >
          {variants.map((variant, index) => (
            <button
              key={variant.name}
              type="button"
              aria-pressed={previewing === index}
              aria-label={`Preview variant ${index + 1}`}
              className={cn(
                'flex h-12 w-20 items-center justify-center overflow-hidden rounded-sm border bg-white focus-visible:outline-2 focus-visible:outline-ring',
                previewing === index ? 'border-primary' : 'border-border'
              )}
              onClick={() => setPreviewing(previewing === index ? null : index)}
            >
              {variant.url ? (
                <img src={variant.url} alt="" className="max-h-full max-w-full object-contain" />
              ) : (
                <span className="text-muted-foreground">{index + 1}</span>
              )}
            </button>
          ))}
        </div>
        <span className="min-w-0 truncate text-muted-foreground">
          1/2/3 preview · Enter adopt · Esc discard all
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1">
          <Button
            size="xs"
            disabled={!current || busy}
            onClick={() => current && void adopt(current)}
          >
            <Check aria-hidden /> Adopt{current ? ` ${(previewing ?? 0) + 1}` : ''}
          </Button>
          <Button size="xs" variant="ghost" disabled={busy} onClick={() => void discard()}>
            <Trash2 aria-hidden /> Discard all
          </Button>
        </span>
      </div>
      {current?.url ? (
        <div className="mt-1.5 flex h-64 items-center justify-center rounded-md border border-border bg-white p-2">
          <img
            src={current.url}
            alt={`Variant ${(previewing ?? 0) + 1}`}
            className="max-h-full max-w-full object-contain"
          />
        </div>
      ) : null}
    </div>
  )
}
