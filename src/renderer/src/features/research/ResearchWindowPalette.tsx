import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, FlaskConical } from 'lucide-react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import { useAppStore } from '@/store'
import { addAppKeyListener, removeAppKeyListener } from '@/lib/app-keyboard-router'
import { getShortcutPlatform } from '@/lib/shortcut-platform'
import { keybindingMatchesAction } from '../../../../shared/keybindings'
import {
  RESEARCH_WINDOW_PAGES,
  RESEARCH_WINDOW_PAGE_LABELS,
  type ResearchWindowPage
} from '../../../../shared/research-page-window'
import { useResearchRecords } from './research-records-store'
import { selectResearchExperimentRecord } from './research-experiment-select'

// Why the same carve-outs as the main window's ⌘K: terminals clear and code editors start chords
// on it, and the Figures canvas asks about its selection (and opens this palette when none is).
const PALETTE_KEY_OWNERS = '.xterm, .monaco-editor, [data-research-figure-canvas]'

type Props = {
  workspaceId: string
  hostId: string | null
  onShowSection: (page: ResearchWindowPage) => void
  onOpenInMain: () => void
}

/**
 * A project window's ⌘K: the main window's jump palette lists every project, so here it lists
 * this window's sections and its project's Experiments, plus a way to the main window.
 */
export function ResearchWindowPalette({
  workspaceId,
  hostId,
  onShowSection,
  onOpenInMain
}: Props): React.JSX.Element {
  const [open, setOpen] = useState(false)
  // A page asks for the palette through the main window's modal; this window has no such modal.
  const requested = useAppStore((state) => state.activeModal === 'worktree-palette')
  useEffect(() => {
    if (requested) {
      setOpen(true)
      useAppStore.getState().closeModal()
    }
  }, [requested])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.repeat || event.defaultPrevented || event.isComposing) {
        return
      }
      const { keybindings } = useAppStore.getState()
      if (
        !keybindingMatchesAction(
          'research.commandPalette',
          event,
          getShortcutPlatform(),
          keybindings
        )
      ) {
        return
      }
      const target = event.target instanceof Element ? event.target : null
      if (target?.closest(PALETTE_KEY_OWNERS)) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      setOpen((current) => !current)
    }
    addAppKeyListener('keydown', onKeyDown)
    return () => removeAppKeyListener('keydown', onKeyDown)
  }, [])

  const document = useResearchRecords((state) => state.document)
  const experiments = useMemo(
    () =>
      (document?.experiments ?? []).filter(
        (experiment) =>
          !experiment.archived &&
          experiment.workspaceId === workspaceId &&
          (hostId === null || experiment.hostId === hostId)
      ),
    [document, hostId, workspaceId]
  )

  const run = (action: () => void | Promise<void>): void => {
    setOpen(false)
    void action()
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Go to"
      description="A section or Experiment of this project"
    >
      <CommandInput placeholder="Go to a section or Experiment…" />
      <CommandList>
        <CommandEmpty>Nothing matches.</CommandEmpty>
        <CommandGroup heading="Sections">
          {RESEARCH_WINDOW_PAGES.map((page) => (
            <CommandItem
              key={page}
              value={`section ${RESEARCH_WINDOW_PAGE_LABELS[page]}`}
              onSelect={() => run(() => onShowSection(page))}
            >
              {RESEARCH_WINDOW_PAGE_LABELS[page]}
            </CommandItem>
          ))}
        </CommandGroup>
        {experiments.length > 0 ? (
          <CommandGroup heading="Experiments">
            {experiments.map((experiment) => (
              <CommandItem
                key={experiment.id}
                value={`experiment ${experiment.name} ${experiment.id}`}
                onSelect={() =>
                  run(async () => {
                    await selectResearchExperimentRecord(experiment.id).catch(() => undefined)
                    onShowSection('research-experiments')
                  })
                }
              >
                <FlaskConical aria-hidden />
                {experiment.name}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
        <CommandGroup heading="Window">
          <CommandItem value="open in main window" onSelect={() => run(onOpenInMain)}>
            <ExternalLink aria-hidden />
            Open in main window
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
