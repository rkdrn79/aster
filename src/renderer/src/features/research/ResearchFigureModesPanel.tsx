import { useState } from 'react'
import { Minus, Plus, X } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { useAppStore } from '@/store'
import { cn } from '@/lib/utils'
import { ResearchChip } from './research-chip'
import {
  FIGURE_CAREFUL_ROUNDS,
  carefulSlowdown,
  projectHasOwnFigureModes,
  resetProjectFigureModes,
  setProjectFigureModes,
  useFigureModesSaved,
  FIGURE_CONCEPT_STYLES,
  type FigureSketchPick
} from './research-figure-modes'
import {
  useEffectiveFigureModes,
  useFigureReferenceLibrary
} from './research-figure-reference-library'
import type { FiguresAgentScope } from './research-figure-chat-slots'
import { ResearchFigureReferencePicker } from './ResearchFigureReferencePicker'

/** An inset section of the panel: a title with its switch, and the details under it. */
function Section({
  title,
  badge,
  checked,
  disabledReason,
  onChange,
  children
}: {
  title: string
  badge?: string
  checked: boolean
  disabledReason?: string | null
  onChange: (on: boolean) => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="flex flex-col gap-2 rounded-lg bg-muted/50 p-3" aria-label={title}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-foreground">
          {title}
          {badge ? (
            <span className="ml-1.5 text-2xs font-normal text-muted-foreground">{badge}</span>
          ) : null}
        </span>
        <Switch
          checked={checked}
          disabled={Boolean(disabledReason)}
          onCheckedChange={onChange}
          aria-label={title}
        />
      </div>
      {children}
    </section>
  )
}

function RoundsStepper({
  value,
  onChange
}: {
  value: number
  onChange: (value: number) => void
}): React.JSX.Element {
  const step = (by: number): void =>
    onChange(Math.min(FIGURE_CAREFUL_ROUNDS.max, Math.max(FIGURE_CAREFUL_ROUNDS.min, value + by)))
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Art director rounds">
      <ResearchChip
        tone="quiet"
        className="size-6 px-0"
        aria-label="Fewer rounds"
        disabled={value <= FIGURE_CAREFUL_ROUNDS.min}
        onClick={() => step(-1)}
      >
        <Minus aria-hidden />
      </ResearchChip>
      <span className="w-6 text-center text-xs tabular-nums" aria-live="polite">
        {value}
      </span>
      <ResearchChip
        tone="quiet"
        className="size-6 px-0"
        aria-label="More rounds"
        disabled={value >= FIGURE_CAREFUL_ROUNDS.max}
        onClick={() => step(1)}
      >
        <Plus aria-hidden />
      </ResearchChip>
    </div>
  )
}

const PICKS: readonly { id: FigureSketchPick; label: string }[] = [
  { id: 'agent', label: 'Agent' },
  { id: 'person', label: 'Me' }
]

/** The details of the Figure agent's switches for one project, in the options popover. */
export function ResearchFigureModesPanel({
  scope,
  conceptReason
}: {
  scope: FiguresAgentScope
  conceptReason: string | null
}): React.JSX.Element {
  const modes = useEffectiveFigureModes(scope)
  const saved = useFigureModesSaved()
  const library = useFigureReferenceLibrary()
  const [choosing, setChoosing] = useState(false)
  const set = (patch: Parameters<typeof setProjectFigureModes>[1]): void =>
    setProjectFigureModes(scope, patch)
  const titles = new Map(library.entries.map((entry) => [entry.id, entry.title ?? entry.id]))

  return (
    <div className="flex flex-col gap-2" data-figure-modes-panel="">
      <Section
        title="Careful drawing"
        checked={modes.careful}
        onChange={(on) => set({ careful: on })}
      >
        <p className="text-2xs leading-snug text-muted-foreground">
          3–4 rough compositions first, then a separate art director reviews the print-size render
          against the references each round and the agent makes its fixes.
        </p>
        <div className="flex items-center justify-between text-xs">
          <span>Art director rounds</span>
          <RoundsStepper value={modes.rounds} onChange={(rounds) => set({ rounds })} />
        </div>
        <div className="flex items-center justify-between text-xs">
          <span>Who picks the sketch</span>
          <div className="flex gap-1" role="group" aria-label="Who picks the sketch">
            {PICKS.map((pick) => (
              <ResearchChip
                key={pick.id}
                tone="quiet"
                className="h-6 px-2"
                aria-pressed={modes.pick === pick.id}
                onClick={() => set({ pick: pick.id })}
              >
                {pick.label}
              </ResearchChip>
            ))}
          </div>
        </div>
        <p className="text-2xs text-muted-foreground" data-figure-careful-cost="">
          Slower: about {carefulSlowdown(modes.rounds)}× time and tokens.
        </p>
      </Section>
      <Section
        title="References"
        checked={modes.references}
        onChange={(on) => set({ references: on })}
      >
        <p className="truncate text-2xs text-muted-foreground" title={library.folder ?? undefined}>
          {library.exists
            ? `${String(library.entries.filter((entry) => entry.image).length)} images in ${library.folder ?? ''}`
            : 'No reference folder yet: the recipes still apply. Add one in Settings → Research.'}
        </p>
        {modes.pinned.length ? (
          <ul className="flex flex-wrap gap-1" aria-label="Pinned references">
            {modes.pinned.map((id) => (
              <li key={id}>
                <ResearchChip
                  className="h-6 gap-1 px-2"
                  aria-label={`Unpin ${id}`}
                  title={titles.get(id) ?? id}
                  onClick={() => set({ pinned: modes.pinned.filter((entry) => entry !== id) })}
                >
                  {id} <X aria-hidden />
                </ResearchChip>
              </li>
            ))}
          </ul>
        ) : null}
        <ResearchChip
          tone="quiet"
          className={cn('h-6 self-start px-2', !modes.references && 'hidden')}
          aria-expanded={choosing}
          onClick={() => setChoosing(!choosing)}
        >
          {choosing ? 'Done choosing' : 'Pin references…'}
        </ResearchChip>
        {choosing && modes.references ? (
          <ResearchFigureReferencePicker
            pinned={modes.pinned}
            onChange={(pinned) => set({ pinned })}
          />
        ) : null}
      </Section>
      <Section
        title="Concept image"
        badge="Experimental"
        checked={modes.concept}
        disabledReason={conceptReason}
        onChange={(on) => set({ concept: on })}
      >
        <p className="text-2xs leading-snug text-muted-foreground">
          {conceptReason ??
            FIGURE_CONCEPT_STYLES.find((style) => style.id === modes.conceptStyle)?.detail}
        </p>
        <div
          className="flex flex-wrap gap-1"
          role="group"
          aria-label="How the concept image is used"
        >
          {FIGURE_CONCEPT_STYLES.map((style) => (
            <ResearchChip
              key={style.id}
              tone="quiet"
              className="h-6 px-2"
              aria-pressed={modes.conceptStyle === style.id}
              disabled={Boolean(conceptReason)}
              onClick={() => set({ conceptStyle: style.id })}
            >
              {style.label}
            </ResearchChip>
          ))}
        </div>
      </Section>
      <div className="flex items-center justify-between gap-2 px-1 pt-1 text-2xs text-muted-foreground">
        <span>For this project. Defaults are in Settings → Research.</span>
        <span className="flex gap-1">
          {projectHasOwnFigureModes(saved, scope) ? (
            <ResearchChip
              tone="quiet"
              className="h-6 px-2"
              onClick={() => resetProjectFigureModes(scope)}
            >
              Use defaults
            </ResearchChip>
          ) : null}
          <ResearchChip
            tone="quiet"
            className="h-6 px-2"
            onClick={() => {
              const state = useAppStore.getState()
              state.openSettingsTarget({
                pane: 'research',
                repoId: null,
                sectionId: 'research-figure-agent'
              })
              state.openSettingsPage()
            }}
          >
            Settings
          </ResearchChip>
        </span>
      </div>
    </div>
  )
}
