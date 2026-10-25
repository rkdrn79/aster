import logo from '../../../../resources/logo.svg'
import { cn } from '@/lib/utils'

// Why a mask: the shipped SVG strokes in white; masking it lets the mark take currentColor in both themes.
const LOGO_MASK = `url("${logo}") center / contain no-repeat`

/** The product mark (resources/logo.svg), painted with the surrounding text color. */
export function ProductLogoMark({ className }: { className?: string }): React.JSX.Element {
  return (
    <span
      aria-hidden
      className={cn('inline-block size-4 shrink-0 bg-current', className)}
      style={{ mask: LOGO_MASK, WebkitMask: LOGO_MASK }}
    />
  )
}
