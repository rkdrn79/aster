import { Fragment } from 'react'
import { Palette } from 'lucide-react'
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut
} from '@/components/ui/dropdown-menu'
import {
  figureStyle,
  figureSwatches,
  type FigureSwatch
} from '../../../../research-harness/research-figures-style.mjs'
import { ARRANGE, shortcutHint, type ArrangeShortcut } from './research-figure-arrange'

/** Arrange items, for the Arrange menu and the More menu's submenu alike. */
export function ArrangeMenuItems({
  selectionItems,
  onArrange
}: {
  /** The selection as a person counts it: a group or a box with its label is one item. */
  selectionItems: number
  onArrange: (shortcut: ArrangeShortcut) => void
}): React.JSX.Element {
  return (
    <>
      <DropdownMenuLabel>
        {selectionItems > 0
          ? `${selectionItems} item${selectionItems === 1 ? '' : 's'} selected`
          : 'Select items to arrange them'}
      </DropdownMenuLabel>
      {ARRANGE.map((group, index) => (
        <Fragment key={group[0].label}>
          {index > 0 ? <DropdownMenuSeparator /> : null}
          {group.map((entry) => {
            const min = entry.min ?? 1
            const short = selectionItems < min
            return (
              <DropdownMenuItem
                key={entry.label}
                disabled={short}
                title={
                  short
                    ? `Select ${min === 1 ? 'something' : `${min} or more items`} first`
                    : undefined
                }
                onSelect={() => onArrange(entry.shortcut)}
              >
                <span className="flex-1">{entry.label}</span>
                <DropdownMenuShortcut>
                  {short ? `needs ${min}+` : shortcutHint(entry)}
                </DropdownMenuShortcut>
              </DropdownMenuItem>
            )
          })}
        </Fragment>
      ))}
    </>
  )
}

export function ColorMenuItems({
  paperStyle,
  onPalette,
  onPaperColors
}: {
  paperStyle: { style: string | null; accent: string | null }
  onPalette: (entry: FigureSwatch) => void
  /** Opens the figure's paper colors: style, accent and the grayscale check. */
  onPaperColors: () => void
}): React.JSX.Element {
  return (
    <>
      <DropdownMenuItem onSelect={onPaperColors}>
        <Palette aria-hidden />
        <span>Paper colors…</span>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuLabel>Color the selection by role</DropdownMenuLabel>
      {figureSwatches(figureStyle(paperStyle.style, paperStyle.accent)).map((entry) => (
        <DropdownMenuItem key={entry.name} onSelect={() => onPalette(entry)}>
          <span
            aria-hidden
            className="size-4 rounded-sm border"
            style={{
              backgroundColor: entry.name === 'line' ? entry.ink : entry.fill,
              borderColor: entry.stroke === 'transparent' ? entry.fill : entry.stroke
            }}
          />
          <span>{entry.label}</span>
        </DropdownMenuItem>
      ))}
    </>
  )
}

export function PartsMenuItems({
  selectionCount,
  onParts,
  onSavePart
}: {
  selectionCount: number
  onParts: () => void
  onSavePart: () => void
}): React.JSX.Element {
  return (
    <>
      <DropdownMenuItem onSelect={onParts}>Show parts library</DropdownMenuItem>
      <DropdownMenuItem disabled={selectionCount === 0} onSelect={onSavePart}>
        Save selection as a part…
      </DropdownMenuItem>
    </>
  )
}
