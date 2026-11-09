import { CaptureUpdateAction, MainMenu, newElementWith } from '@excalidraw/excalidraw'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import {
  Download,
  Eraser,
  Grid3x3,
  History,
  LifeBuoy,
  Magnet,
  Palette,
  RectangleHorizontal
} from 'lucide-react'
import { toast } from 'sonner'
import { PAGE_FRAME_ID } from '../../../../research-harness/research-figures-model.mjs'
import { figureCommand } from './research-figure-commands'

const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform)
const mod = isMac ? '⌘' : 'Ctrl+'

/** Deletes everything but the page frame, in one undo step. */
function clearDrawing(api: ExcalidrawImperativeAPI): void {
  const elements = api.getSceneElementsIncludingDeleted()
  const page = elements.find((element) => element.id === PAGE_FRAME_ID)
  api.updateScene({
    elements: elements.map((element) =>
      element.id === page?.id || element.isDeleted
        ? element
        : newElementWith(element, { isDeleted: true })
    ),
    captureUpdate: CaptureUpdateAction.IMMEDIATELY
  })
  toast.success(`Drawing cleared; the page stays. ${mod}Z brings it back.`)
}

/**
 * The figure's own menu in place of Excalidraw's (no reset, no social links): page and style,
 * grid and snapping, export, history, help, and clearing the drawing but not the page.
 */
export function ResearchFigureMainMenu({
  api,
  grid,
  snap
}: {
  api: () => ExcalidrawImperativeAPI | null
  grid: boolean
  snap: boolean
}): React.JSX.Element {
  const setGrid = (value: boolean): void => {
    api()?.updateScene({
      appState: { gridModeEnabled: value },
      captureUpdate: CaptureUpdateAction.NEVER
    })
  }
  const setSnap = (value: boolean): void => {
    api()?.updateScene({
      appState: { objectsSnapModeEnabled: value },
      captureUpdate: CaptureUpdateAction.NEVER
    })
  }
  return (
    <MainMenu>
      <MainMenu.Item icon={<RectangleHorizontal />} onSelect={() => figureCommand('page-size')}>
        Page size…
      </MainMenu.Item>
      <MainMenu.Item icon={<Palette />} onSelect={() => figureCommand('style')}>
        Paper colors…
      </MainMenu.Item>
      <MainMenu.Separator />
      <MainMenu.Item
        icon={<Grid3x3 />}
        selected={grid}
        shortcut={`${mod}'`}
        onSelect={() => setGrid(!grid)}
      >
        Grid
      </MainMenu.Item>
      <MainMenu.Item
        icon={<Magnet />}
        selected={snap}
        shortcut="Alt+S"
        onSelect={() => setSnap(!snap)}
      >
        Snap to objects
      </MainMenu.Item>
      <MainMenu.Separator />
      <MainMenu.Item icon={<Download />} onSelect={() => figureCommand('export')}>
        Export…
      </MainMenu.Item>
      <MainMenu.Item icon={<History />} onSelect={() => figureCommand('history')}>
        History
      </MainMenu.Item>
      <MainMenu.Item
        icon={<LifeBuoy />}
        shortcut="?"
        onSelect={() =>
          api()?.updateScene({
            appState: { openDialog: { name: 'help' } },
            captureUpdate: CaptureUpdateAction.NEVER
          })
        }
      >
        Help and shortcuts
      </MainMenu.Item>
      <MainMenu.Separator />
      <MainMenu.Item
        icon={<Eraser />}
        onSelect={() => {
          const current = api()
          if (current) {
            clearDrawing(current)
          }
        }}
      >
        Clear drawing (keeps the page)
      </MainMenu.Item>
    </MainMenu>
  )
}
