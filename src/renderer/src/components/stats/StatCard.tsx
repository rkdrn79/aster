type StatCardProps = {
  label: string
  value: string
  icon: React.ReactNode
}

export function StatCard({ label, value, icon }: StatCardProps): React.JSX.Element {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border/50 bg-card/60 px-4 py-3">
      <div className="shrink-0 text-muted-foreground">{icon}</div>
      <div className="min-w-0">
        <p className="text-lg font-semibold leading-tight tabular-nums text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}
