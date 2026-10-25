import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'

export function ResearchCsvMapping({
  columns,
  selectedX,
  selectedMetrics,
  onXChange,
  onMetricsChange
}: {
  columns: string[]
  selectedX: string | null
  selectedMetrics: string[]
  onXChange: (column: string | null) => void
  onMetricsChange: (column: string, included: boolean) => void
}): React.JSX.Element {
  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-medium">X-axis</span>
        <Select
          value={selectedX === null ? 'sample-index' : String(columns.indexOf(selectedX))}
          onValueChange={(value) =>
            onXChange(value === 'sample-index' ? null : (columns[Number(value)] ?? null))
          }
        >
          <SelectTrigger size="sm" aria-label="CSV x-axis" className="min-w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sample-index">Row number</SelectItem>
            {columns.map((name, index) => (
              <SelectItem key={name} value={String(index)}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <fieldset>
        <legend className="text-xs font-medium">Metrics</legend>
        <div className="scrollbar-sleek mt-2 flex max-h-28 flex-wrap gap-3 overflow-auto">
          {columns
            .filter((name) => name !== selectedX)
            .map((name) => (
              <label key={name} className="flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  aria-label={`Include metric ${name}`}
                  checked={selectedMetrics.includes(name)}
                  onChange={(event) => onMetricsChange(name, event.target.checked)}
                />
                {name}
              </label>
            ))}
        </div>
      </fieldset>
    </div>
  )
}
