import { useState } from 'react'
import { Check, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  FIGURE_STYLES,
  figureStyle,
  type FigureStyle,
  type FigureStyleName
} from '../../../../research-harness/research-figures-style.mjs'
import { ACCENT_NAMES, checkAccent, parseAccentHex } from './research-figure-accent'
import { useFigureEditorHandle } from './research-figure-editor-handle'
import { FIGURE_MOD_KEY } from './research-figure-shortcuts'
import { applyPaperStyle, type PaperStyleChoice } from './research-figure-style-apply'
import { presetName, ResearchFigureStyleTile } from './ResearchFigureStyleTile'
import { FIGURE_VISIONS, setFigureVision, useFigureVision } from './ResearchFigureVisionPreview'
import { useFigurePaperStyle, type FigurePaperStyle } from './use-figure-paper-style'

const isPreset = (name: string): name is FigureStyleName => Object.hasOwn(FIGURE_STYLES, name)
const PRESETS = Object.keys(FIGURE_STYLES).filter(isPreset)
const UNDO = FIGURE_MOD_KEY === 'Cmd' ? '⌘Z' : 'Ctrl+Z'

function Heading({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-3 pt-3 pb-1.5">
      <h3 className="flex-1 text-2xs font-medium tracking-wide text-muted-foreground uppercase">
        {children}
      </h3>
      {aside}
    </div>
  )
}

function chooserText(paper: FigurePaperStyle): string {
  return paper.styleBy === 'person'
    ? 'Your choice; the Figure agent keeps it'
    : paper.styleBy === 'agent'
      ? 'Picked by the Figure agent'
      : 'Default; the agent picks by genre'
}

function Swatch({ fill, stroke }: { fill: string; stroke: string }) {
  return (
    <span
      aria-hidden
      className="size-4 shrink-0 rounded-full border-2"
      style={{ backgroundColor: fill, borderColor: stroke }}
    />
  )
}

function Notes({ notes }: { notes: readonly string[] }) {
  return notes.length ? (
    <ul className="space-y-0.5 px-3 pt-1.5 text-2xs text-muted-foreground" role="status">
      {notes.map((note) => (
        <li key={note} className="flex items-start gap-1">
          <TriangleAlert className="mt-px size-3 shrink-0 text-status-warning" aria-hidden />
          {note}
        </li>
      ))}
    </ul>
  ) : null
}

function Presets({
  current,
  disabled,
  onPick
}: {
  current: FigureStyle
  disabled: boolean
  onPick: (choice: PaperStyleChoice) => void
}) {
  return (
    <div className="grid grid-cols-3 gap-2 px-3" role="group" aria-label="Paper style">
      {PRESETS.map((name) => {
        const chosen = current.name === name
        // Why the current accent on the chosen tile only: every other preset comes with its own.
        const style = chosen ? current : figureStyle(name)
        const label = presetName(FIGURE_STYLES[name].label)
        return (
          <button
            key={name}
            type="button"
            aria-pressed={chosen}
            aria-label={label}
            title={FIGURE_STYLES[name].label}
            disabled={disabled}
            className="group flex min-w-0 flex-col gap-1 rounded-md text-left focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60"
            onClick={() => onPick({ style: name })}
          >
            <span
              className={cn(
                'block h-[58px] overflow-hidden rounded-md border border-border group-hover:border-foreground/40',
                chosen && 'border-foreground ring-1 ring-foreground'
              )}
            >
              <ResearchFigureStyleTile style={style} />
            </span>
            <span className="flex items-center gap-1 truncate text-2xs text-foreground">
              {chosen ? <Check className="size-3 shrink-0" aria-hidden /> : null}
              {label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function Accents({
  current,
  paper,
  disabled,
  onPick
}: {
  current: FigureStyle
  paper: FigurePaperStyle
  disabled: boolean
  onPick: (choice: PaperStyleChoice) => void
}) {
  const [draft, setDraft] = useState('')
  const hex = parseAccentHex(draft)
  const mono = current.name === 'print-mono'
  const shown = hex ?? current.accentName
  const check =
    shown && !mono ? checkAccent(shown, figureStyle(current.name).block, paper.redLoss) : null
  const custom = current.accentName?.startsWith('#') ? current.accentName : null
  return (
    <div>
      <Heading
        aside={
          current.name === 'categorical' ? (
            <span className="text-2xs text-muted-foreground">recolors the first kind</span>
          ) : null
        }
      >
        Accent
      </Heading>
      {mono ? (
        <p className="px-3 text-2xs text-muted-foreground">
          Print mono has no hue: emphasis is a darker gray and an ink outline.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1 px-3" role="group" aria-label="Accent">
            {ACCENT_NAMES.map((name) => {
              const accent = figureStyle(current.name, name).accents[0]
              const chosen = current.accentName === name
              return (
                <button
                  key={name}
                  type="button"
                  aria-pressed={chosen}
                  aria-label={`Accent ${name}`}
                  title={name}
                  disabled={disabled}
                  className={cn(
                    'flex size-7 items-center justify-center rounded-md border border-transparent hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring',
                    chosen && 'border-foreground bg-accent'
                  )}
                  onClick={() => onPick({ style: current.name, accent: name })}
                >
                  <Swatch fill={accent.fill} stroke={accent.ink} />
                </button>
              )
            })}
          </div>
          <form
            className="flex items-center gap-1.5 px-3 pt-2"
            onSubmit={(event) => {
              event.preventDefault()
              if (hex) {
                onPick({ style: current.name, accent: hex })
                setDraft('')
              }
            }}
          >
            <Input
              aria-label="Custom accent, any hex color"
              placeholder={custom ?? 'Any color, e.g. #2f7d6d'}
              className="h-7 flex-1"
              value={draft}
              spellCheck={false}
              onChange={(event) => setDraft(event.target.value)}
            />
            <Button type="submit" size="xs" variant="outline" disabled={!hex || disabled}>
              Use
            </Button>
          </form>
          {check ? (
            <div
              className="flex items-center gap-2 px-3 pt-2 text-2xs text-muted-foreground"
              aria-label={`${hex ? 'Would use' : 'Uses'} fill ${check.tint}, heavy ${check.strong}, text ${check.shade}`}
            >
              <span>{hex ? 'Would use' : 'Uses'}</span>
              {(
                [
                  ['fill', check.tint],
                  ['heavy', check.strong],
                  ['text', check.shade]
                ] as const
              ).map(([part, color]) => (
                <span key={part} className="flex items-center gap-1">
                  <span
                    aria-hidden
                    className="size-3 rounded-[3px] border border-border"
                    style={{ backgroundColor: color }}
                  />
                  {part}
                </span>
              ))}
            </div>
          ) : null}
          <Notes notes={check?.notes ?? []} />
        </>
      )}
    </div>
  )
}

function Vision() {
  const vision = useFigureVision((state) => state.vision)
  return (
    <div>
      <Heading>Check</Heading>
      <div className="grid grid-cols-2 gap-1 px-3" role="group" aria-label="Color check">
        {FIGURE_VISIONS.map((entry) => (
          <button
            key={entry.vision}
            type="button"
            aria-pressed={vision === entry.vision}
            aria-label={`${entry.label} preview`}
            title={`Show the canvas ${entry.detail}; the figure is not changed`}
            className="flex h-7 items-center justify-center rounded-md border border-border px-1.5 text-xs hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring aria-pressed:border-foreground aria-pressed:bg-accent"
            onClick={() => setFigureVision(vision === entry.vision ? null : entry.vision)}
          >
            {entry.label}
          </button>
        ))}
      </div>
    </div>
  )
}

type Done = { recolored: number; kept: number; from: string; to: string }

function doneText(done: Done): string {
  const kept = done.kept
    ? `; ${done.kept} with ${done.kept === 1 ? 'its' : 'their'} own color${done.kept === 1 ? '' : 's'} kept`
    : ''
  return `Recolored ${done.recolored} element${done.recolored === 1 ? '' : 's'} by role${kept}. ${UNDO} undoes.`
}

/**
 * The figure's paper colors: the colour study's presets drawn small, the accent (a swatch or any
 * hex, run through its rule), and grayscale and deuteranopia previews of the canvas. A pick
 * recolours the figure by role in one undo step and is recorded as the person's choice.
 */
export function ResearchFigureStylePanel(): React.JSX.Element {
  const paper = useFigurePaperStyle()
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<Done | null>(null)
  if (!paper) {
    return (
      <p className="p-3 text-xs text-muted-foreground">
        This figure has no page frame, so it has no paper style to change.
      </p>
    )
  }
  const current = figureStyle(paper.style, paper.accent, { panels: paper.panels })
  const pick = async (choice: PaperStyleChoice): Promise<void> => {
    const handle = useFigureEditorHandle.getState().handle
    if (!handle || busy) {
      return
    }
    setBusy(true)
    // Why: an edit from outside the canvas autosaves like the Inspector's.
    handle.noteUserInput()
    try {
      const result = await applyPaperStyle(handle.api, choice)
      setDone(
        result
          ? {
              recolored: result.recolored,
              kept: result.kept,
              from: current.name,
              to: result.style.name
            }
          : null
      )
    } finally {
      setBusy(false)
    }
  }
  const redraw =
    done && done.to !== done.from && (done.to === 'illustrative' || done.from === 'illustrative')
  return (
    <div className="scrollbar-sleek max-h-[min(640px,calc(100vh-140px))] overflow-y-auto pb-3">
      <div className="flex items-baseline gap-2 border-b border-border px-3 py-2">
        <span className="text-xs font-medium">Paper colors</span>
        <span className="ml-auto truncate text-2xs text-muted-foreground">
          {chooserText(paper)}
        </span>
      </div>
      <Heading>Style</Heading>
      <Presets current={current} disabled={busy} onPick={(choice) => void pick(choice)} />
      <Accents
        current={current}
        paper={paper}
        disabled={busy}
        onPick={(choice) => void pick(choice)}
      />
      <Vision />
      <p className="px-3 pt-3 text-2xs text-muted-foreground" role="status">
        {done
          ? doneText(done)
          : 'Recolors boxes, text and lines by role; colors you set yourself stay.'}
        {redraw
          ? ' Only colors changed: ask the Figure agent to redraw it for the illustrative look (rounded type, tinted panels).'
          : ''}
      </p>
    </div>
  )
}
