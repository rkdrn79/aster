import { ServerOff } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

/** The plain sentence behind the badge, for titles and screen readers. */
export function recordedElsewhereText(host: string): string {
  return `Recorded on ${host}; this host can't observe it`
}

/** Marks a Run another machine recorded whose folder is not on this host. */
export function ResearchRunHostBadge({
  host,
  className
}: {
  host: string
  className?: string
}): React.JSX.Element {
  const text = recordedElsewhereText(host)
  return (
    <Badge variant="outline" className={cn('max-w-full', className)}>
      <ServerOff aria-hidden className="size-3 shrink-0" />
      <span className="truncate">{text}</span>
    </Badge>
  )
}

/** The Runs list's short form, beside a Run's status: `· on node05`, the sentence on hover. */
export function ResearchRunHostNote({ host }: { host: string }): React.JSX.Element {
  const text = recordedElsewhereText(host)
  return (
    <span
      role="img"
      title={text}
      aria-label={text}
      className="inline-flex min-w-0 items-center gap-1"
    >
      <span aria-hidden>·</span>
      <ServerOff aria-hidden className="size-3 shrink-0" />
      <span aria-hidden className="truncate">
        on {host}
      </span>
    </span>
  )
}
