import { useMemo } from 'react'
import { figurePage } from '../../../../research-harness/research-figures-model.mjs'
import { figureStyle } from '../../../../research-harness/research-figures-style.mjs'
import { useFigureEditorHandle } from './research-figure-editor-handle'
import {
  registerFigureSidePanelTab,
  type FigureSidePanelContext
} from './research-figure-side-panel'
import { ResearchFigureInsertPanel } from './ResearchFigureInsertPanel'

/** The Parts tab: the Insert panel for the figure open on the canvas. */
function ResearchFigurePartsTab({
  context
}: {
  context: FigureSidePanelContext
}): React.JSX.Element {
  const handle = useFigureEditorHandle((state) => state.handle)
  const page = handle ? figurePage(handle.api.getSceneElements()) : null
  const style = useMemo(() => figureStyle(page?.style, page?.accent), [page?.style, page?.accent])
  const project = useMemo(
    () => (context.folder ? { owner: context.owner, folder: context.folder } : null),
    [context.owner, context.folder]
  )
  if (!handle || !project || !context.slug) {
    return (
      <p className="p-6 text-center text-xs text-muted-foreground">
        Open a figure to insert blocks, icons and templates.
      </p>
    )
  }
  return (
    // Why capture: an insert from here is a person's edit, so the figure autosaves it.
    <div
      className="flex min-h-0 flex-1 flex-col"
      onPointerDownCapture={handle.noteUserInput}
      onKeyDownCapture={handle.noteUserInput}
    >
      <ResearchFigureInsertPanel api={() => handle.api} style={style} project={project} />
    </div>
  )
}

// Why at import: the Figures page imports this module once to add the Parts tab.
registerFigureSidePanelTab({
  id: 'parts',
  label: 'Parts',
  order: 10,
  render: (context) => <ResearchFigurePartsTab context={context} />
})
