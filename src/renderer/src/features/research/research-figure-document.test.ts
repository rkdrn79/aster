import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  figureElement,
  newFigureScene
} from '../../../../research-harness/research-figures-model.mjs'
import {
  areaAnswered,
  areaChildrenKey,
  decideExternalChange,
  figureExportsStale,
  figureFileText,
  parseFigureText,
  sceneSha256,
  sketchFilePath
} from './research-figure-document'

const base = figureFileText(newFigureScene({ widthIn: 3.25, heightIn: 2 }))

function withBox(text: string): string {
  const scene = JSON.parse(text)
  scene.elements.push(figureElement('rectangle', { id: 'agent-box', width: 40, height: 20 }))
  return figureFileText(scene)
}

describe('decideExternalChange', () => {
  it('reloads an agent write when nothing is unsaved, and asks when something is', () => {
    const disk = withBox(base)
    expect(decideExternalChange({ base, disk: base, dirty: true })).toEqual({ kind: 'unchanged' })
    expect(decideExternalChange({ base, disk, dirty: false })).toEqual({
      kind: 'reload',
      text: disk
    })
    expect(decideExternalChange({ base, disk, dirty: true })).toEqual({
      kind: 'conflict',
      text: disk
    })
  })

  it('leaves both sides alone while the file is half-written or invalid', () => {
    const half = base.slice(0, 40)
    const invalid = decideExternalChange({ base, disk: half, dirty: false })
    expect(invalid.kind).toBe('invalid')
    const broken = JSON.stringify({ type: 'excalidraw', elements: [{ id: 'x', type: 'blob' }] })
    const result = decideExternalChange({ base, disk: broken, dirty: true })
    expect(result.kind === 'invalid' && result.issues.join(' ')).toMatch(/unknown type "blob"/)
  })
})

describe('parseFigureText', () => {
  it('returns the elements of a valid scene and the reasons of an invalid one', () => {
    expect(parseFigureText(base).elements.map((element) => element.id)).toEqual(['figure-page'])
    expect(parseFigureText('{').issues[0]).toMatch(/^Not valid JSON yet/)
  })

  it('leaves out elements with NaN geometry (null on disk) and opens the rest', () => {
    const scene = JSON.parse(withBox(base))
    const broken = figureElement('rectangle', { id: 'nan-cell', width: 40, height: 20 })
    scene.elements.push({ ...broken, x: null, boundElements: [{ type: 'arrow', id: 'link' }] })
    const link = figureElement('arrow', { id: 'link', width: 40, height: 0 })
    scene.elements.push({
      ...link,
      points: [
        [0, 0],
        [40, 0]
      ],
      endBinding: { elementId: 'nan-cell' }
    })
    const parsed = parseFigureText(figureFileText(scene))
    expect(parsed.issues).toEqual([])
    expect(parsed.repairs).toEqual(['Dropped nan-cell: x not a number'])
    expect(parsed.elements.map((element) => element.id)).toEqual([
      'figure-page',
      'agent-box',
      'link'
    ])
    expect(parsed.elements.at(-1)?.endBinding).toBeNull()
  })
})

describe('figureExportsStale', () => {
  it('rewrites missing exports and exports older than the scene', () => {
    expect(figureExportsStale({ sceneMtime: 10, svgMtime: null, pdfMtime: 20 })).toBe(true)
    expect(figureExportsStale({ sceneMtime: 30, svgMtime: 20, pdfMtime: 40 })).toBe(true)
    expect(figureExportsStale({ sceneMtime: 10, svgMtime: 20, pdfMtime: 20 })).toBe(false)
  })
})

describe('pending areas', () => {
  const frame = figureElement('frame', { id: 'area', x: 0, y: 0, width: 100, height: 60 })
  const old = figureElement('text', {
    id: 't1',
    frameId: 'area',
    text: 'old',
    width: 20,
    height: 10
  })

  it('stays pending until the frame children change or the frame goes away', () => {
    const key = areaChildrenKey([frame, old], 'area')
    expect(areaAnswered([frame, old], 'area', key)).toBe(false)
    const redrawn = { ...old, text: 'Encoder' }
    expect(areaAnswered([frame, redrawn], 'area', key)).toBe(true)
    const added = figureElement('rectangle', { id: 'r1', frameId: 'area', width: 10, height: 10 })
    expect(areaAnswered([frame, old, added], 'area', key)).toBe(true)
    expect(areaAnswered([old], 'area', key)).toBe(true)
  })
})

describe('sketchFilePath', () => {
  it('puts sketches beside the figures with a safe name and the image type', () => {
    expect(sketchFilePath('paper/figures', 'method', 'a/b*c', 'image/jpeg')).toBe(
      'paper/figures/sketches/method-abc.jpg'
    )
    expect(sketchFilePath('paper/figures', 'method', 'x1', 'image/png')).toBe(
      'paper/figures/sketches/method-x1.png'
    )
  })
})

describe('sceneSha256', () => {
  it('hashes the scene as the harness does, so figures preview sees a fresh render', async () => {
    const text = `${base}é ✓`
    expect(await sceneSha256(text)).toBe(createHash('sha256').update(text).digest('hex'))
  })
})
