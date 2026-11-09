import { X } from 'lucide-react'
import { create } from 'zustand'
import { Button } from '@/components/ui/button'

/** How the canvas is shown while a person checks a figure's legibility; the file never changes. */
export type FigureVision = 'grayscale' | 'deuteranopia'

export const FIGURE_VISIONS: readonly { vision: FigureVision; label: string; detail: string }[] = [
  { vision: 'grayscale', label: 'Grayscale', detail: 'as a gray print shows it' },
  {
    vision: 'deuteranopia',
    label: 'Deuteranopia',
    detail: 'as a reader with red-green color blindness sees it'
  }
]

export const useFigureVision = create<{ vision: FigureVision | null }>(() => ({ vision: null }))

export function setFigureVision(vision: FigureVision | null): void {
  useFigureVision.setState({ vision })
}

/**
 * Deuteranopia (Machado, Oliveira and Fernandes 2009, severity 1) in linear RGB, as Chromium's
 * vision-deficiency emulation draws it; the canvas CSS points its filter here.
 */
function VisionFilters(): React.JSX.Element {
  return (
    <svg aria-hidden width="0" height="0" className="pointer-events-none absolute">
      <filter id="aster-figure-deuteranopia" colorInterpolationFilters="linearRGB">
        <feColorMatrix
          type="matrix"
          values="0.367322 0.860646 -0.227968 0 0  0.280085 0.672501 0.047413 0 0  -0.01182 0.04294 0.968881 0 0  0 0 0 1 0"
        />
      </filter>
    </svg>
  )
}

/** The filter, and a chip over the canvas that says the preview is on and turns it off. */
export function ResearchFigureVisionPreview(): React.JSX.Element {
  const vision = useFigureVision((state) => state.vision)
  const entry = FIGURE_VISIONS.find((item) => item.vision === vision)
  return (
    <>
      <VisionFilters />
      {entry ? (
        <div
          role="status"
          aria-label="Color preview"
          className="absolute bottom-16 left-1/2 z-[4] flex -translate-x-1/2 items-center gap-1 rounded-md border border-border bg-popover py-0.5 pr-0.5 pl-2 text-xs text-popover-foreground shadow-sm"
        >
          <span>
            {entry.label} preview <span className="text-muted-foreground">· {entry.detail}</span>
          </span>
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label="Turn the color preview off"
            title="Turn the preview off"
            onClick={() => setFigureVision(null)}
          >
            <X aria-hidden />
          </Button>
        </div>
      ) : null}
    </>
  )
}
