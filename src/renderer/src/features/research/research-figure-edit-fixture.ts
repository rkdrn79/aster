// Shared by the figure editing tests: the kit's method figure in miniature.
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'

/** Scene units per point in the fixture, as in Aster's figures. */
export const PT = 2

type Spec = { id: string; type: string } & Record<string, unknown>
const base = {
  x: 0,
  y: 0,
  width: 10,
  height: 10,
  angle: 0,
  version: 1,
  isDeleted: false,
  locked: false,
  groupIds: [],
  strokeColor: '#1e1e1e',
  backgroundColor: 'transparent',
  strokeStyle: 'solid',
  strokeWidth: 2,
  opacity: 100,
  customData: {}
}
const text = (spec: Spec) => ({
  containerId: null,
  textAlign: 'left',
  verticalAlign: 'top',
  fontSize: 16,
  ...spec
})

/**
 * The kit's method figure in miniature: plain boxes with bound labels, a box whose two label lines
 * and math are grouped with it, snowflake badges, a panel with its title and an arrow label.
 */
export function scene(): ExcalidrawElement[] {
  const specs: Spec[] = [
    { id: 'figure-page', type: 'frame', x: 0, y: 0, width: 972, height: 360 },
    {
      id: 'patch',
      type: 'rectangle',
      x: 170,
      y: 36,
      width: 120,
      height: 44,
      backgroundColor: '#e9e9e9'
    },
    text({
      id: 'patch-label',
      type: 'text',
      x: 202,
      y: 48,
      width: 56,
      height: 20,
      containerId: 'patch',
      textAlign: 'center',
      verticalAlign: 'middle'
    }),
    {
      id: 'embed',
      type: 'rectangle',
      x: 178,
      y: 112,
      width: 120,
      height: 44,
      backgroundColor: '#e9e9e9'
    },
    text({
      id: 'embed-label',
      type: 'text',
      x: 192,
      y: 124,
      width: 92,
      height: 20,
      containerId: 'embed',
      textAlign: 'center',
      verticalAlign: 'middle'
    }),
    {
      id: 'mask',
      type: 'rectangle',
      x: 164,
      y: 214,
      width: 120,
      height: 44,
      backgroundColor: '#cecece'
    },
    text({
      id: 'mask-label',
      type: 'text',
      x: 176,
      y: 226,
      width: 96,
      height: 20,
      containerId: 'mask',
      textAlign: 'center',
      verticalAlign: 'middle'
    }),
    { id: 'mask-frozen', type: 'image', x: 273, y: 207, width: 18, height: 18 },
    {
      id: 'ctx',
      type: 'rectangle',
      x: 380,
      y: 40,
      width: 112,
      height: 80,
      backgroundColor: '#c5def8',
      groupIds: ['ctx-shape']
    },
    text({
      id: 'ctx-label-0-0',
      type: 'text',
      x: 410,
      y: 48,
      width: 52,
      height: 20,
      groupIds: ['ctx-label-group', 'ctx-shape']
    }),
    text({
      id: 'ctx-label-1-0',
      type: 'text',
      x: 407,
      y: 68,
      width: 58,
      height: 20,
      groupIds: ['ctx-label-group', 'ctx-shape']
    }),
    {
      id: 'ctx-label-2-0',
      type: 'image',
      x: 428,
      y: 91,
      width: 16,
      height: 16,
      groupIds: ['ctx-label-group', 'ctx-shape'],
      customData: { asterMath: { tex: 'f_\\theta', size: 16, color: '#1e1e1e' } }
    },
    {
      id: 'tok',
      type: 'rectangle',
      x: 560,
      y: 222,
      width: 104,
      height: 40,
      backgroundColor: '#cecece'
    },
    text({
      id: 'tok-label',
      type: 'text',
      x: 580,
      y: 232,
      width: 64,
      height: 20,
      containerId: 'tok',
      textAlign: 'center',
      verticalAlign: 'middle'
    }),
    { id: 'tok-frozen', type: 'image', x: 653, y: 215, width: 18, height: 18 },
    {
      id: 'panel',
      type: 'rectangle',
      x: 370,
      y: 9,
      width: 304,
      height: 122,
      backgroundColor: '#f4f4f4',
      groupIds: ['panel-panel']
    },
    text({
      id: 'panel-title-0',
      type: 'text',
      x: 378,
      y: 13,
      width: 82,
      height: 18,
      fontSize: 14,
      groupIds: ['panel-panel']
    }),
    {
      id: 'a-ema',
      type: 'arrow',
      x: 436,
      y: 124,
      width: 0,
      height: 86,
      points: [
        [0, 0],
        [0, 86]
      ],
      strokeStyle: 'dashed',
      strokeWidth: 1.5
    },
    text({
      id: 'a-ema-label-0',
      type: 'text',
      x: 441,
      y: 151,
      width: 30,
      height: 18,
      fontSize: 14,
      groupIds: ['a-ema-label-group']
    })
  ]
  // Why the JSON round trip: it types plain fixtures as scene elements without a cast, as the
  // editor itself takes a scene from a file.
  return JSON.parse(JSON.stringify(specs.map((spec) => ({ ...base, ...spec }))))
}

export const byId = (elements: readonly ExcalidrawElement[], id: string): ExcalidrawElement => {
  const found = elements.find((element) => element.id === id)
  if (!found) {
    throw new Error(`no ${id}`)
  }
  return found
}
export const pick = (elements: readonly ExcalidrawElement[], ...ids: string[]) =>
  elements.filter((element) => ids.includes(element.id))
export const centreX = (element: ExcalidrawElement) => element.x + element.width / 2
export const fontPt = (element: ExcalidrawElement) =>
  element.type === 'text' ? element.fontSize / PT : 0
