import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  ChevronDown,
  FileText,
  LayoutGrid,
  Library,
  MessageSquareText,
  MoreHorizontal,
  Palette,
  Save,
  Sparkles
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { useMeasuredWidth } from '@/components/right-sidebar/right-sidebar-measured-width'
import type { FigureSwatch } from '../../../../research-harness/research-figures-style.mjs'
import { ResearchFigureExportMenu } from './ResearchFigureExportMenu'
import { ResearchFigurePageControl } from './ResearchFigurePageControl'
import { ResearchFigureSaveButton } from './ResearchFigureSaveButton'
import { ResearchFigureStylePanel } from './ResearchFigureStylePanel'
import { ArrangeMenuItems, ColorMenuItems, PartsMenuItems } from './ResearchFigureToolbarMenus'
import { ResearchFigureUseInPaper } from './ResearchFigureUseInPaper'
import type { ArrangeShortcut } from './research-figure-arrange'
import { onFigureCommand } from './research-figure-commands'
import { useFigureToolbarCommand } from './research-figure-shortcuts'
import { figureToolbarLayout, type ToolbarSlot } from './research-figure-toolbar-layout'
import { useResearchFigures } from './research-figures-store'

export { sendArrangeShortcut, type ArrangeShortcut } from './research-figure-arrange'

const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform)
const chord = (keys: string, other: string): string => (isMac ? keys : other)

type Props = {
  dirty: boolean
  busy: 'saving' | 'exporting' | null
  /** When the last save finished, for "Saved ✓ · 2s ago". */
  savedAt: number | null
  areaMode: boolean
  selectionCount: number
  /** The selection as a person counts it: a group or a box with its label is one item. */
  selectionItems: number
  fontPt: number | null
  onSave: () => void
  onGenerateInArea: () => void
  onAskSelection: () => void
  onArrange: (shortcut: ArrangeShortcut) => void
  /** The figure's style and accent (from its page), for the Colors menu. */
  paperStyle: { style: string | null; accent: string | null }
  onPalette: (entry: FigureSwatch) => void
  onParts: () => void
  /** Saves the selection as a reusable part (project or all projects). */
  onSavePart: () => void
}

function saveLabel(busy: Props['busy'], dirty: boolean): string {
  return busy === 'saving'
    ? 'Saving…'
    : busy === 'exporting'
      ? 'Exporting…'
      : dirty
        ? 'Save'
        : 'Saved'
}

/**
 * The figure's tools. Controls fold into "⋯ More" by priority as the canvas narrows (Parts
 * first, Export never), and the page's shortcuts open Export, Use in paper, Ask and Generate.
 */
export function ResearchFigureToolbar(props: Props): React.JSX.Element {
  const { dirty, busy, areaMode, selectionCount, selectionItems, fontPt } = props
  const [width, setWidth] = useState(0)
  const measure = useMeasuredWidth(useCallback((value: number | null) => setWidth(value ?? 0), []))
  const layout = figureToolbarLayout(width, fontPt !== null ? 44 : 0)
  const show = (slot: ToolbarSlot): boolean => layout.visible.has(slot)
  const [menu, setMenu] = useState<'export' | 'page' | 'colors' | 'style' | null>(null)
  const [paperOpen, setPaperOpen] = useState(false)
  const manuscript = useResearchFigures((state) => state.manuscript)
  const latest = useRef(props)
  useLayoutEffect(() => {
    latest.current = props
  })
  useEffect(
    () =>
      useFigureToolbarCommand.subscribe((state, previous) => {
        if (state.seq === previous.seq || !state.command) {
          return
        }
        const current = latest.current
        if (state.command === 'ask' && current.selectionCount > 0) {
          current.onAskSelection()
        } else if (state.command === 'generate') {
          current.onGenerateInArea()
        } else if (state.command === 'export') {
          setMenu('export')
        } else if (state.command === 'paper') {
          setPaperOpen(true)
        }
      }),
    []
  )
  useEffect(
    () =>
      // The canvas's figure menu: its page size, colours and export open these controls.
      onFigureCommand((command) => {
        const open =
          command === 'page-size'
            ? 'page'
            : command === 'export'
              ? 'export'
              : command === 'style'
                ? 'style'
                : null
        if (open) {
          // Why the frame: Excalidraw's menu is still closing and would take the focus back.
          window.requestAnimationFrame(() => setMenu(open))
        }
      }),
    []
  )
  // Why the frame: a popover opened while the More menu closes would lose focus to its trigger.
  const later = (open: () => void) => () => window.requestAnimationFrame(open)

  const save = (
    <ResearchFigureSaveButton
      dirty={dirty}
      busy={busy}
      savedAt={props.savedAt}
      onSave={props.onSave}
    />
  )
  const generate = (
    <Button
      size="xs"
      variant={areaMode ? 'secondary' : 'ghost'}
      aria-pressed={areaMode}
      aria-label="Generate in area"
      title={`Drag over the canvas, or select a frame, then say what goes there (${chord('⌘⇧G', 'Ctrl+Shift+G')})`}
      onClick={props.onGenerateInArea}
    >
      <Sparkles aria-hidden /> Generate
    </Button>
  )
  const ask = (
    <Button
      size="xs"
      variant="ghost"
      aria-label="Ask about selection"
      title={`Ask the agent about the selected elements (${chord('⌘K', 'Ctrl+K')})`}
      disabled={selectionCount === 0}
      onClick={props.onAskSelection}
    >
      <MessageSquareText aria-hidden /> Ask
    </Button>
  )
  const iconMenu = (
    label: string,
    Icon: typeof Palette,
    items: React.ReactNode,
    control?: { open: boolean; onOpenChange: (open: boolean) => void }
  ) => (
    <DropdownMenu {...control}>
      <DropdownMenuTrigger asChild>
        <Button size="xs" variant="ghost" aria-label={label} title={label}>
          <Icon aria-hidden />
          <ChevronDown aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56">
        {items}
      </DropdownMenuContent>
    </DropdownMenu>
  )
  const arrangeItems = (
    <ArrangeMenuItems selectionItems={selectionItems} onArrange={props.onArrange} />
  )
  const colorItems = (
    <ColorMenuItems
      paperStyle={props.paperStyle}
      onPalette={props.onPalette}
      onPaperColors={later(() => setMenu('style'))}
    />
  )
  // Why an anchor round the Colors menu: the paper colors open beside the control they belong to.
  const colors = (
    <Popover open={menu === 'style'} onOpenChange={(open) => setMenu(open ? 'style' : null)}>
      <PopoverAnchor asChild>
        <span className="inline-flex">
          {iconMenu('Colors', Palette, colorItems, {
            open: menu === 'colors',
            onOpenChange: (open) => setMenu(open ? 'colors' : null)
          })}
        </span>
      </PopoverAnchor>
      <PopoverContent align="start" aria-label="Paper colors" role="dialog" className="w-[344px]">
        <ResearchFigureStylePanel />
      </PopoverContent>
    </Popover>
  )
  const partsItems = (
    <PartsMenuItems
      selectionCount={selectionCount}
      onParts={props.onParts}
      onSavePart={props.onSavePart}
    />
  )

  return (
    <div
      ref={measure}
      role="toolbar"
      aria-label="Figure tools"
      className="flex shrink-0 flex-nowrap items-center gap-1 overflow-hidden border-b border-border px-3 py-1.5"
    >
      {show('save') ? save : null}
      {show('save') && (show('generate') || show('ask')) ? (
        <span className="mx-1 h-4 w-px shrink-0 bg-border" aria-hidden />
      ) : null}
      {show('generate') ? generate : null}
      {show('ask') ? ask : null}
      {show('arrange') || show('colors') || show('parts') ? (
        <span className="mx-1 h-4 w-px shrink-0 bg-border" aria-hidden />
      ) : null}
      {show('arrange') ? iconMenu('Arrange', LayoutGrid, arrangeItems) : null}
      {show('colors') || menu === 'colors' || menu === 'style' ? colors : null}
      {show('parts') ? iconMenu('ML parts', Library, partsItems) : null}
      {fontPt !== null && !layout.overflow.length ? (
        <span
          className="px-1 text-xs text-muted-foreground tabular-nums"
          title="Text size when printed"
        >
          {fontPt} pt
        </span>
      ) : null}
      <div className="ml-auto flex shrink-0 items-center gap-1">
        {show('page') || menu === 'page' ? (
          <ResearchFigurePageControl
            open={menu === 'page'}
            onOpenChange={(open) => setMenu(open ? 'page' : null)}
          />
        ) : null}
        {show('paper') ? (
          <Button
            size="xs"
            variant="outline"
            aria-label="Use in paper"
            title={`Use in paper (${chord('⌘⇧L', 'Ctrl+Shift+L')})`}
            onClick={() => setPaperOpen(true)}
          >
            <FileText aria-hidden /> Use in paper
          </Button>
        ) : null}
        <ResearchFigureExportMenu
          open={menu === 'export'}
          onOpenChange={(open) => setMenu(open ? 'export' : null)}
          selectionCount={selectionCount}
          disabled={busy !== null}
        />
        {layout.overflow.length ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon-xs" variant="ghost" aria-label="More figure tools" title="More">
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-52">
              {layout.overflow.map((slot) => {
                switch (slot) {
                  case 'save':
                    return (
                      <DropdownMenuItem key={slot} disabled={busy !== null} onSelect={props.onSave}>
                        <Save aria-hidden /> {saveLabel(busy, dirty)}
                      </DropdownMenuItem>
                    )
                  case 'ask':
                    return (
                      <DropdownMenuItem
                        key={slot}
                        disabled={selectionCount === 0}
                        onSelect={props.onAskSelection}
                      >
                        <MessageSquareText aria-hidden /> Ask about selection
                      </DropdownMenuItem>
                    )
                  case 'generate':
                    return (
                      <DropdownMenuItem key={slot} onSelect={props.onGenerateInArea}>
                        <Sparkles aria-hidden /> Generate in area
                      </DropdownMenuItem>
                    )
                  case 'paper':
                    return (
                      <DropdownMenuItem key={slot} onSelect={later(() => setPaperOpen(true))}>
                        <FileText aria-hidden /> Use in paper…
                      </DropdownMenuItem>
                    )
                  case 'page':
                    return (
                      <DropdownMenuItem key={slot} onSelect={later(() => setMenu('page'))}>
                        <ChevronDown aria-hidden /> Page size…
                      </DropdownMenuItem>
                    )
                  case 'export':
                    return null
                  case 'arrange':
                  case 'colors':
                  case 'parts': {
                    const [label, Icon, items] =
                      slot === 'arrange'
                        ? (['Arrange', LayoutGrid, arrangeItems] as const)
                        : slot === 'colors'
                          ? (['Colors', Palette, colorItems] as const)
                          : (['ML parts', Library, partsItems] as const)
                    return (
                      <DropdownMenuSub key={slot}>
                        <DropdownMenuSubTrigger>
                          <Icon aria-hidden /> {label}
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="min-w-56">
                          {items}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    )
                  }
                }
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      <ResearchFigureUseInPaper
        open={paperOpen}
        onOpenChange={setPaperOpen}
        manuscript={manuscript}
        dirty={dirty}
      />
    </div>
  )
}
