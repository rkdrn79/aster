import { useCallback, useRef, useState, type ReactNode } from 'react'
import { useMeasuredWidth } from '@/components/right-sidebar/right-sidebar-measured-width'
import { ResearchResizableSidePane, useStoredSidePaneWidth } from './ResearchResizableSidePane'
import {
  LIBRARY_LIST_WIDTH_LIMITS,
  LIBRARY_LIST_WIDTH_STORAGE_KEY,
  LIBRARY_PANEL_WIDTH_LIMITS,
  LIBRARY_PANEL_WIDTH_STORAGE_KEY,
  libraryPaneWidths,
  libraryPanelDefaultWidth,
  readStoredLibraryPaneWidth,
  saveLibraryPaneWidth
} from './research-library-pane-widths'

type Props = {
  listOpen: boolean
  list: ReactNode
  reader: ReactNode
  panel: ReactNode
}

export function ResearchLibrarySplitLayout({
  listOpen,
  list,
  reader,
  panel
}: Props): React.JSX.Element {
  const [containerWidth, setContainerWidth] = useState(0)
  const measureContainer = useMeasuredWidth(
    useCallback((width: number | null) => setContainerWidth(width ?? 0), [])
  )
  const [listPreferred, commitListWidth] = useStoredSidePaneWidth(
    LIBRARY_LIST_WIDTH_STORAGE_KEY,
    LIBRARY_LIST_WIDTH_LIMITS
  )
  const [panelStored, setPanelStored] = useState(() =>
    readStoredLibraryPaneWidth(LIBRARY_PANEL_WIDTH_STORAGE_KEY)
  )
  const panelDefault = libraryPanelDefaultWidth(containerWidth)
  const commitPanelWidth = useCallback(
    (width: number): void => {
      // Why: a reset to the default keeps following the window instead of pinning today's width.
      const stored = width === panelDefault ? null : width
      setPanelStored(stored)
      saveLibraryPaneWidth(LIBRARY_PANEL_WIDTH_STORAGE_KEY, stored, LIBRARY_PANEL_WIDTH_LIMITS)
    },
    [panelDefault]
  )
  const widths = libraryPaneWidths(
    containerWidth,
    listOpen,
    listPreferred,
    panelStored ?? panelDefault
  )
  const readerRef = useRef<HTMLDivElement | null>(null)
  const [frozenReaderWidth, setFrozenReaderWidth] = useState<number | null>(null)
  // Why: PdfViewer re-fits and repaints on every width change; hold it still until the drag ends.
  const freezeReader = useCallback((resizing: boolean): void => {
    setFrozenReaderWidth(resizing ? (readerRef.current?.clientWidth ?? null) : null)
  }, [])

  return (
    <div ref={measureContainer} className="flex min-h-0 min-w-0 flex-1">
      {widths.list ? (
        <ResearchResizableSidePane
          side="start"
          label="Resize paper list and reader"
          width={widths.list.width}
          bounds={widths.list}
          defaultWidth={LIBRARY_LIST_WIDTH_LIMITS.defaultWidth}
          onWidthChange={commitListWidth}
          onResizingChange={freezeReader}
        >
          {list}
        </ResearchResizableSidePane>
      ) : null}
      <div
        ref={readerRef}
        className="flex min-h-0 min-w-0 flex-1"
        style={frozenReaderWidth === null ? undefined : { overflow: 'hidden' }}
      >
        <div
          className="flex min-h-0 min-w-0 flex-1"
          style={
            frozenReaderWidth === null ? undefined : { flex: 'none', width: frozenReaderWidth }
          }
        >
          {reader}
        </div>
      </div>
      <ResearchResizableSidePane
        side="end"
        label="Resize paper reader and reading panel"
        width={widths.panel.width}
        bounds={widths.panel}
        defaultWidth={panelDefault}
        onWidthChange={commitPanelWidth}
        onResizingChange={freezeReader}
      >
        {panel}
      </ResearchResizableSidePane>
    </div>
  )
}
