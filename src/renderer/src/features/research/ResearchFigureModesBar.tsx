import { useEffect, useState } from 'react'
import { Image as ImageIcon, Images, PencilRuler, SlidersHorizontal } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ResearchChip } from './research-chip'
import { carefulSlowdown, setProjectFigureModes } from './research-figure-modes'
import {
  ensureFigureReferenceLibrary,
  loadFigureConceptSupport,
  useEffectiveFigureModes,
  useFigureReferenceLibrary
} from './research-figure-reference-library'
import type { FiguresAgentScope } from './research-figure-chat-slots'
import { ResearchFigureModesPanel } from './ResearchFigureModesPanel'

const DISABLED_CHIP = 'aria-disabled:cursor-not-allowed aria-disabled:opacity-50'

/**
 * The Figure agent's switches for this project, quiet chips above the chat: careful drawing,
 * references and the experimental concept image. The options button holds their details.
 */
export function ResearchFigureModesBar({ scope }: { scope: FiguresAgentScope }): React.JSX.Element {
  const modes = useEffectiveFigureModes(scope)
  const concept = useFigureReferenceLibrary((state) => state.concept)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    void ensureFigureReferenceLibrary()
    if (!useFigureReferenceLibrary.getState().concept) {
      void loadFigureConceptSupport()
    }
  }, [])
  const conceptReason =
    concept === null ? 'Checking for Codex…' : concept.available ? null : concept.reason
  const slower = carefulSlowdown(modes.rounds)

  return (
    <div
      role="group"
      aria-label="Figure agent switches"
      data-figure-modes=""
      className="flex flex-wrap items-center gap-1.5"
    >
      <ResearchChip
        tone="quiet"
        className="px-2.5"
        aria-pressed={modes.careful}
        aria-label="Careful drawing"
        title={`Careful drawing: 3–4 sketches, then a separate art director reviews ${String(modes.rounds)} rounds. Slower: about ${String(slower)}× time.`}
        onClick={() => setProjectFigureModes(scope, { careful: !modes.careful })}
      >
        <PencilRuler aria-hidden />
        {modes.careful ? `Careful · ${String(modes.rounds)} rounds` : 'Careful'}
      </ResearchChip>
      <ResearchChip
        tone="quiet"
        className="px-2.5"
        aria-pressed={modes.references}
        aria-label="References"
        title="Pick published reference figures before drawing (figures refs)"
        onClick={() => setProjectFigureModes(scope, { references: !modes.references })}
      >
        <Images aria-hidden />
        {modes.references && modes.pinned.length
          ? `References · ${String(modes.pinned.length)} pinned`
          : 'References'}
      </ResearchChip>
      <ResearchChip
        tone="quiet"
        className={`px-2.5 ${DISABLED_CHIP}`}
        aria-pressed={modes.concept}
        aria-disabled={conceptReason ? true : undefined}
        aria-label="Concept image (experimental)"
        title={
          conceptReason ??
          (modes.conceptStyle === 'hybrid'
            ? 'Experimental: Codex draws only the illustrative parts, without text; the agent draws every word, arrow and count over them'
            : 'Experimental: Codex draws a concept image first; the agent redraws it as editable shapes with the paper’s words')
        }
        onClick={() => {
          if (!conceptReason) {
            setProjectFigureModes(scope, { concept: !modes.concept })
          }
        }}
      >
        <ImageIcon aria-hidden />
        {modes.concept && modes.conceptStyle === 'hybrid' ? 'Hybrid art' : 'Concept'}{' '}
        <span className="text-2xs text-muted-foreground">exp.</span>
      </ResearchChip>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <ResearchChip tone="quiet" className="px-2" aria-label="Figure agent switch options">
            <SlidersHorizontal aria-hidden />
          </ResearchChip>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80">
          <ResearchFigureModesPanel scope={scope} conceptReason={conceptReason} />
        </PopoverContent>
      </Popover>
      {modes.careful ? (
        <span className="text-2xs text-muted-foreground" data-figure-careful-cost="">
          slower: about {slower}× time
        </span>
      ) : null}
    </div>
  )
}
