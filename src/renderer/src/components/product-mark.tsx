import type { CSSProperties } from 'react'

// Inline copy of resources/logo.svg: html-to-image share captures and currentColor tinting need inline SVG.
export function ProductMark({
  className,
  style
}: {
  className?: string
  style?: CSSProperties
}): React.JSX.Element {
  return (
    <svg
      className={className}
      style={style}
      viewBox="-2 -2 104 104"
      fill="none"
      stroke="currentColor"
      strokeWidth={12.98}
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M50 50L50.00 6.49 M50 50L12.32 28.24 M50 50L12.32 71.76 M50 50L50.00 93.51 M50 50L87.68 71.76 M50 50L87.68 28.24" />
    </svg>
  )
}
