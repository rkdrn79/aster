import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  COMPUTE_REFRESH_INTERVAL_OPTIONS,
  writeComputeRefreshInterval
} from './research-compute-refresh-interval'

/** How often the Compute page re-reads its hosts; the choice is remembered on this device. */
export function ResearchComputeRefreshSelect({
  intervalMs,
  onChange
}: {
  intervalMs: number
  onChange: (intervalMs: number) => void
}): React.JSX.Element {
  return (
    <Select
      value={String(intervalMs)}
      onValueChange={(next) => {
        const ms = Number(next)
        writeComputeRefreshInterval(ms)
        onChange(ms)
      }}
    >
      <SelectTrigger size="sm" aria-label="Auto-refresh interval">
        <SelectValue />
      </SelectTrigger>
      {/* Why popper: item-aligned opens over the header and scrolls the first options out of view. */}
      <SelectContent position="popper" align="end">
        {COMPUTE_REFRESH_INTERVAL_OPTIONS.map((option) => (
          <SelectItem key={option.ms} value={String(option.ms)}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
