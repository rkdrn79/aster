import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ResearchResizableSidePane, useStoredSidePaneWidth } from './ResearchResizableSidePane'
import { clampToSidePaneBounds, sidePaneWidthBounds } from './research-side-pane-width'
import {
  WRITING_FILE_TREE_WIDTH_LIMITS,
  writingFileTreeWidthStorageKey
} from './research-writing-file-tree-width'

type Props = {
  experimentId: string
  filesOpen: boolean
  fileTree: ReactNode
  editor: ReactNode
}

export function ResearchWritingFileTreeSplit({
  experimentId,
  filesOpen,
  fileTree,
  editor
}: Props): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [preferredWidth, commitWidth] = useStoredSidePaneWidth(
    writingFileTreeWidthStorageKey(experimentId),
    WRITING_FILE_TREE_WIDTH_LIMITS
  )
  const bounds = sidePaneWidthBounds(containerWidth, WRITING_FILE_TREE_WIDTH_LIMITS)

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }
    const measure = (): void => setContainerWidth(container.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={containerRef} className="flex min-h-0 min-w-0 flex-1">
      {filesOpen && (
        <ResearchResizableSidePane
          side="start"
          label="Resize TeX files and editor"
          width={clampToSidePaneBounds(preferredWidth, bounds)}
          bounds={bounds}
          defaultWidth={WRITING_FILE_TREE_WIDTH_LIMITS.defaultWidth}
          onWidthChange={commitWidth}
        >
          {fileTree}
        </ResearchResizableSidePane>
      )}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{editor}</div>
    </div>
  )
}
