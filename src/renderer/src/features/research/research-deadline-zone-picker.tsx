import { useMemo, useState } from 'react'
import { Check, ChevronDown, Globe } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { availableTimeZones, formatZoneOffset, systemTimeZone } from './research-deadline-format'

const MAX_VISIBLE_ZONES = 80

type Props = {
  /** null follows the operating system zone. */
  value: string | null
  now: number
  locale: string
  disabled?: boolean
  onChange: (timeZone: string | null) => void
}

export function ResearchDeadlineZonePicker({
  value,
  now,
  locale,
  disabled,
  onChange
}: Props): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const system = systemTimeZone()
  const active = value ?? system
  const zones = useMemo(() => availableTimeZones(), [])
  const matches = useMemo(() => {
    const normalized = query.trim().toLowerCase().replace(/\s+/g, '_')
    const found = normalized
      ? zones.filter((zone) => zone.toLowerCase().includes(normalized))
      : zones
    return found.slice(0, MAX_VISIBLE_ZONES)
  }, [query, zones])

  function choose(next: string | null): void {
    setOpen(false)
    setQuery('')
    if (next !== value) {
      onChange(next)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          role="combobox"
          aria-expanded={open}
          aria-label="Display time zone"
          disabled={disabled}
          className="max-w-72 justify-between"
        >
          <Globe aria-hidden />
          <span className="min-w-0 truncate">
            {active.replace(/_/g, ' ')} · {formatZoneOffset(now, active, locale)}
          </span>
          <ChevronDown className="opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(20rem,calc(100vw-1rem))]">
        <Command shouldFilter={false} density="menu" label="Search time zones">
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Search city or region…"
            aria-label="Search time zones"
          />
          <CommandList>
            <CommandEmpty>No time zone matches.</CommandEmpty>
            {query.trim() ? null : (
              <CommandItem value="__system__" selection="palette" onSelect={() => choose(null)}>
                <span className="min-w-0 flex-1 truncate">
                  This computer ({system.replace(/_/g, ' ')})
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {formatZoneOffset(now, system, locale)}
                </span>
                {value === null ? <Check className="size-3.5 shrink-0" /> : null}
              </CommandItem>
            )}
            {matches.map((zone) => (
              <CommandItem
                key={zone}
                value={zone}
                selection="palette"
                onSelect={() => choose(zone)}
              >
                <span className="min-w-0 flex-1 truncate">{zone.replace(/_/g, ' ')}</span>
                <span className="shrink-0 text-muted-foreground">
                  {formatZoneOffset(now, zone, locale)}
                </span>
                {value === zone ? <Check className="size-3.5 shrink-0" /> : null}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
