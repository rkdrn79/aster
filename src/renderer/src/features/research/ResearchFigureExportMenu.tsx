import { useState } from 'react'
import { ChevronDown, Clipboard, Download } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useFigureEditorHandle } from './research-figure-editor-handle'
import {
  copyFigurePng,
  toastExported,
  writeFigureExport,
  type FigureExportFormat,
  type FigureExportOptions
} from './research-figure-export-formats'

const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform)
const FORMATS: readonly { format: FigureExportFormat; label: string; detail: string }[] = [
  { format: 'pdf', label: 'PDF', detail: 'vector, for \\includegraphics' },
  { format: 'svg', label: 'SVG', detail: 'vector' },
  { format: 'png300', label: 'PNG · 300 dpi', detail: 'slides, posters' },
  { format: 'png600', label: 'PNG · 600 dpi', detail: 'print' }
]

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

/** Export ▾ (⌘⇧E): PDF first, then SVG and PNG; transparent and selection-only apply to all. */
export function ResearchFigureExportMenu({
  open,
  onOpenChange,
  selectionCount,
  disabled
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectionCount: number
  disabled: boolean
}): React.JSX.Element {
  const [options, setOptions] = useState<FigureExportOptions>({
    transparent: false,
    selectionOnly: false
  })
  const [busy, setBusy] = useState(false)
  const effective = { ...options, selectionOnly: options.selectionOnly && selectionCount > 0 }

  async function run(format: FigureExportFormat): Promise<void> {
    const handle = useFigureEditorHandle.getState().handle
    if (!handle) {
      return
    }
    setBusy(true)
    try {
      const path = await writeFigureExport({ ...handle, format, options: effective })
      toastExported(handle.target.owner, path)
    } catch (cause) {
      toast.error(`Export failed. ${errorText(cause)}`)
    } finally {
      setBusy(false)
    }
  }

  async function copy(): Promise<void> {
    const handle = useFigureEditorHandle.getState().handle
    if (!handle) {
      return
    }
    try {
      await copyFigurePng(handle.api, effective)
      toast.success('PNG copied to the clipboard.')
    } catch (cause) {
      toast.error(`Copy failed. ${errorText(cause)}`)
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          size="xs"
          variant="ghost"
          aria-label="Export"
          title={`Export (${isMac ? '⌘⇧E' : 'Ctrl+Shift+E'})`}
          disabled={disabled || busy}
        >
          <Download aria-hidden className={busy ? 'animate-pulse' : undefined} /> Export
          <ChevronDown aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-60">
        <DropdownMenuLabel>
          {effective.selectionOnly ? `Export ${selectionCount} selected` : 'Export the page'}
        </DropdownMenuLabel>
        {FORMATS.map((entry) => (
          <DropdownMenuItem key={entry.format} onSelect={() => void run(entry.format)}>
            <span className="flex-1">{entry.label}</span>
            <DropdownMenuShortcut>{entry.detail}</DropdownMenuShortcut>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={options.transparent}
          onSelect={(event) => event.preventDefault()}
          onCheckedChange={(checked) => setOptions({ ...options, transparent: checked === true })}
        >
          Transparent background
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={effective.selectionOnly}
          disabled={selectionCount === 0}
          onSelect={(event) => event.preventDefault()}
          onCheckedChange={(checked) => setOptions({ ...options, selectionOnly: checked === true })}
        >
          Selection only{selectionCount === 0 ? ' (select something first)' : ''}
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void copy()}>
          <Clipboard aria-hidden /> Copy PNG to clipboard
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
