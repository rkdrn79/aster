import { useState } from 'react'
import { BookCheck, Ellipsis, FileSearch, Scale, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { ReadingRequest } from './research-library-reading-agent'
import { READING_LANGUAGES, type ReadingLanguageId } from './research-library-reading-language'

type QuickRequest = 'summarize' | 'relate' | 'critique'

// Same one-row treatment as the Experiment agent: the rest fold into "⋯" on a narrow panel.
const QUICK_REQUESTS: { kind: QuickRequest; label: string; Icon: LucideIcon }[] = [
  { kind: 'summarize', label: 'Summarize', Icon: FileSearch },
  { kind: 'relate', label: 'Relate to project', Icon: BookCheck },
  { kind: 'critique', label: 'Critique', Icon: Scale }
]
const INLINE_QUICK_REQUESTS = 1

/** The Reading agent's quick requests and answer language, above its chat. */
export function ResearchLibraryReadingActions({
  language,
  onLanguageChange,
  onRequest
}: {
  language: ReadingLanguageId
  onLanguageChange: (language: ReadingLanguageId) => void
  onRequest: (request: ReadingRequest) => Promise<string | null>
}): React.JSX.Element {
  const [quickError, setQuickError] = useState<string | null>(null)
  const [quickBusy, setQuickBusy] = useState(false)

  async function quick(kind: QuickRequest): Promise<void> {
    if (quickBusy) {
      return
    }
    setQuickBusy(true)
    setQuickError(null)
    try {
      setQuickError(await onRequest({ kind }))
    } finally {
      setQuickBusy(false)
    }
  }

  return (
    <div className="shrink-0 space-y-1.5 border-b border-border px-3 py-2">
      <div
        role="group"
        aria-label="Ask the reading agent"
        className="@container flex items-center gap-1.5 overflow-hidden"
      >
        {QUICK_REQUESTS.map(({ kind, label, Icon }, index) => (
          <Button
            key={kind}
            size="xs"
            variant="outline"
            disabled={quickBusy}
            className={cn('shrink-0', index >= INLINE_QUICK_REQUESTS && 'hidden @md:inline-flex')}
            onClick={() => void quick(kind)}
          >
            <Icon aria-hidden />
            {label}
          </Button>
        ))}
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon-xs"
              variant="ghost"
              disabled={quickBusy}
              aria-label="More requests"
              className="shrink-0 @md:hidden"
            >
              <Ellipsis aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {QUICK_REQUESTS.slice(INLINE_QUICK_REQUESTS).map(({ kind, label, Icon }) => (
              <DropdownMenuItem key={kind} onSelect={() => void quick(kind)}>
                <Icon aria-hidden />
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <select
          aria-label="Answer language"
          className="ml-auto rounded border border-border bg-background px-1.5 py-0.5 text-xs"
          value={language}
          onChange={(event) => {
            const next = READING_LANGUAGES.find((entry) => entry.id === event.target.value)
            if (next) {
              onLanguageChange(next.id)
            }
          }}
        >
          {READING_LANGUAGES.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}
            </option>
          ))}
        </select>
      </div>
      {quickError ? (
        <p role="alert" className="text-xs text-destructive">
          {quickError}
        </p>
      ) : null}
    </div>
  )
}
