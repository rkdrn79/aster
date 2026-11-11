import { ChevronDown, Languages } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
  READING_LANGUAGES,
  readingLanguageInfo,
  type ReadingLanguageId
} from './research-reading-language'
import type { RebuttalTranslationView } from './research-rebuttal-translation-view'

/**
 * The reading language (the same setting as the Library's), whether translations show, and a
 * way to have the outdated ones redone. English shows no translations, so only the picker.
 */
export function ResearchRebuttalLanguageMenu({
  language,
  onLanguageChange,
  view,
  onViewChange,
  todo,
  agentBusy,
  readOnly,
  onTranslate
}: {
  language: ReadingLanguageId
  onLanguageChange: (language: ReadingLanguageId) => void
  view: RebuttalTranslationView
  onViewChange: (view: RebuttalTranslationView) => void
  /** Items with no current translation. */
  todo: number
  agentBusy: boolean
  readOnly: boolean
  onTranslate: () => void
}): React.JSX.Element {
  const translating = language !== 'en'
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="xs"
          variant="ghost"
          aria-label={`Reading language: ${readingLanguageInfo(language).label}`}
        >
          <Languages aria-hidden />
          {readingLanguageInfo(language).label}
          {translating && view === 'original' ? (
            <span className="text-muted-foreground">· original only</span>
          ) : translating && todo ? (
            <span className="text-muted-foreground">· {todo} to translate</span>
          ) : null}
          <ChevronDown aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Reading language</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={language}
          onValueChange={(value) => {
            const next = READING_LANGUAGES.find((entry) => entry.id === value)
            if (next) {
              onLanguageChange(next.id)
            }
          }}
        >
          {READING_LANGUAGES.map((entry) => (
            <DropdownMenuRadioItem key={entry.id} value={entry.id}>
              {entry.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {translating ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Show</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={view}
              onValueChange={(value) => onViewChange(value === 'original' ? 'original' : 'both')}
            >
              <DropdownMenuRadioItem value="both">Original and translation</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="original">Original only</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={!todo || agentBusy || readOnly} onSelect={onTranslate}>
              <Languages aria-hidden />
              {todo
                ? `Translate ${todo} ${todo === 1 ? 'item' : 'items'} now`
                : 'Everything is translated'}
            </DropdownMenuItem>
            <p className="px-2 pt-1 pb-1.5 text-2xs leading-4 text-muted-foreground">
              The Rebuttal agent translates replies as it writes them, and the rest once it is idle
              and you have stopped typing. Same setting as the Library.
            </p>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
