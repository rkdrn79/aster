import { useEffect, useRef, useState } from 'react'
import { FolderOpen, ImagePlus, Minus, Plus, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { isImeOwnedKeyboardEvent } from '@/lib/ime-composition-keyboard-event'
import {
  FIGURE_CAREFUL_ROUNDS,
  FIGURE_CONCEPT_STYLES,
  carefulSlowdown,
  figureModeDefaults,
  setFigureModeDefaults,
  setFigureReferenceFolder,
  useFigureModesSaved
} from '@/features/research/research-figure-modes'
import {
  addFigureReferenceFile,
  ensureFigureReferenceLibrary,
  loadFigureConceptSupport,
  loadFigureReferenceLibrary,
  useFigureReferenceLibrary
} from '@/features/research/research-figure-reference-library'
import { Button } from '../ui/button'
import { SearchableSetting } from './SearchableSetting'
import { SettingsRow } from './SettingsFormControls'
import {
  getResearchFigureAgentSearchEntry,
  getResearchFigureReferencesSearchEntry
} from './research-settings-search'

function Toggle({
  label,
  detail,
  checked,
  disabledReason,
  onChange,
  children
}: {
  label: string
  detail: string
  checked: boolean
  disabledReason?: string | null
  onChange: (on: boolean) => void
  children?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm text-foreground">{label}</span>
        <span className="text-xs text-muted-foreground">{disabledReason ?? detail}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {children}
        <Switch
          checked={checked}
          disabled={Boolean(disabledReason)}
          onCheckedChange={onChange}
          aria-label={label}
        />
      </div>
    </div>
  )
}

/** Settings → Research: what a new project's Figure agent starts with. */
export function ResearchFigureAgentSetting(): React.JSX.Element {
  const entry = getResearchFigureAgentSearchEntry()
  const saved = useFigureModesSaved()
  const library = useFigureReferenceLibrary()
  useEffect(() => {
    void ensureFigureReferenceLibrary()
    if (!useFigureReferenceLibrary.getState().concept) {
      void loadFigureConceptSupport()
    }
  }, [])
  const defaults = figureModeDefaults(saved, library.exists)
  const conceptReason =
    library.concept === null
      ? 'Checking for Codex…'
      : library.concept.available
        ? null
        : library.concept.reason
  const step = (by: number): void =>
    setFigureModeDefaults({
      rounds: Math.min(
        FIGURE_CAREFUL_ROUNDS.max,
        Math.max(FIGURE_CAREFUL_ROUNDS.min, defaults.rounds + by)
      )
    })
  return (
    <SearchableSetting {...entry} id={entry.targetSectionId}>
      <div className="flex flex-col gap-1" data-figure-agent-defaults="">
        <div className="flex flex-col gap-0.5 pb-1">
          <span className="text-sm font-medium text-foreground">{entry.title}</span>
          <span className="text-xs text-muted-foreground">{entry.description}</span>
        </div>
        <Toggle
          label="Careful drawing"
          detail={`3–4 sketches, then a separate art director reviews each round. Slower: about ${String(carefulSlowdown(defaults.rounds))}× time.`}
          checked={defaults.careful}
          onChange={(careful) => setFigureModeDefaults({ careful })}
        >
          <span className="flex items-center gap-1" role="group" aria-label="Art director rounds">
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Fewer rounds"
              disabled={defaults.rounds <= FIGURE_CAREFUL_ROUNDS.min}
              onClick={() => step(-1)}
            >
              <Minus aria-hidden />
            </Button>
            <span className="w-14 text-center text-xs tabular-nums">{defaults.rounds} rounds</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="More rounds"
              disabled={defaults.rounds >= FIGURE_CAREFUL_ROUNDS.max}
              onClick={() => step(1)}
            >
              <Plus aria-hidden />
            </Button>
          </span>
        </Toggle>
        <Toggle
          label="References"
          detail={
            saved.defaults.references === undefined
              ? `Pick published references before drawing. On while a reference folder exists (${library.exists ? 'it does' : 'none yet'}).`
              : 'Pick published references before drawing (figures refs).'
          }
          checked={defaults.references}
          onChange={(references) => setFigureModeDefaults({ references })}
        />
        <Toggle
          label="Concept image (experimental)"
          detail={
            FIGURE_CONCEPT_STYLES.find((style) => style.id === defaults.conceptStyle)?.detail ?? ''
          }
          checked={defaults.concept && !conceptReason}
          disabledReason={conceptReason}
          onChange={(concept) => setFigureModeDefaults({ concept })}
        >
          <span className="flex gap-1" role="group" aria-label="How the concept image is used">
            {FIGURE_CONCEPT_STYLES.map((style) => (
              <Button
                key={style.id}
                type="button"
                variant={defaults.conceptStyle === style.id ? 'secondary' : 'ghost'}
                size="xs"
                aria-pressed={defaults.conceptStyle === style.id}
                disabled={Boolean(conceptReason)}
                onClick={() => setFigureModeDefaults({ conceptStyle: style.id })}
              >
                {style.id === 'redraw' ? 'Redraw' : 'Hybrid'}
              </Button>
            ))}
          </span>
        </Toggle>
      </div>
    </SearchableSetting>
  )
}

/** Settings → Research: the folder of reference figures on this computer, and adding images to it. */
export function ResearchFigureReferencesSetting(): React.JSX.Element {
  const entry = getResearchFigureReferencesSearchEntry()
  const saved = useFigureModesSaved()
  const library = useFigureReferenceLibrary()
  const [draft, setDraft] = useState(saved.folder ?? '')
  const fileRef = useRef<HTMLInputElement | null>(null)
  useEffect(() => setDraft(saved.folder ?? ''), [saved.folder])
  useEffect(() => {
    void ensureFigureReferenceLibrary()
  }, [])
  const apply = (folder: string | null): void => {
    setFigureReferenceFolder(folder)
    void loadFigureReferenceLibrary()
  }
  const images = library.entries.filter((item) => item.image).length
  const own = library.entries.filter((item) => !item.recipe).length
  return (
    <SearchableSetting {...entry} id={entry.targetSectionId}>
      <SettingsRow
        label={entry.title}
        description={
          <>
            {entry.description}{' '}
            <span data-figure-reference-status="">
              {library.exists
                ? `${String(images)} images (${String(own)} of your own).`
                : 'The folder does not exist yet; adding an image creates it.'}
            </span>
          </>
        }
        alignTop
        control={
          <div className="flex w-[300px] flex-col gap-2">
            <input
              value={draft}
              aria-label="Reference folder"
              placeholder={library.defaultFolder ?? 'Aster app data/figure-references'}
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
              onChange={(event) => setDraft(event.target.value)}
              onBlur={() => {
                if (draft.trim() !== (saved.folder ?? '')) {
                  apply(draft)
                }
              }}
              onKeyDown={(event) => {
                if (isImeOwnedKeyboardEvent(event)) {
                  return
                }
                if (event.key === 'Enter') {
                  apply(draft)
                }
              }}
            />
            <div className="flex flex-wrap gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  void window.api.repos.pickDirectory().then((folder) => {
                    if (folder) {
                      apply(folder)
                    }
                  })
                }
              >
                <FolderOpen aria-hidden /> Choose…
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
              >
                <ImagePlus aria-hidden /> Add image…
              </Button>
              {saved.folder ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => apply(null)}>
                  <RotateCcw aria-hidden /> Default
                </Button>
              ) : null}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (file) {
                  void addFigureReferenceFile(file).then((failure) =>
                    failure ? toast.error(failure) : toast.success(`Added ${file.name}`)
                  )
                }
              }}
            />
          </div>
        }
      />
    </SearchableSetting>
  )
}
