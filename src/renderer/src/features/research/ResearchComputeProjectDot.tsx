export function ResearchComputeProjectDot({ color }: { color: string | null }): React.JSX.Element {
  return (
    <span
      aria-hidden
      className="inline-block size-2.5 shrink-0 rounded-full border border-border bg-muted"
      style={color ? { backgroundColor: color } : undefined}
    />
  )
}
