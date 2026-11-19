// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  PAPER_FACES,
  embedPaperFonts,
  paperFacesIn,
  paperFontFaces,
  registerPaperFonts
} from './research-figure-paper-fonts'
import { keepWrittenTextSize, textFont } from './research-figure-text-fonts'

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg"><text font-family="Latin Modern Roman, Segoe UI Emoji">Output</text><text font-family="Liberation Sans, Segoe UI Emoji">x</text></svg>'

describe('the paper look’s faces in Excalidraw', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('joins Excalidraw’s family table under its own numbers, once', () => {
    const table: Record<string, number> = { Virgil: 1, 'Liberation Sans': 9 }
    registerPaperFonts(table)
    registerPaperFonts(table)
    expect(table).toEqual({
      Virgil: 1,
      'Liberation Sans': 9,
      'Latin Modern Roman': 20,
      'TeX Gyre Termes': 21
    })
  })

  it('finds the faces an exported SVG sets its text in', () => {
    expect(paperFacesIn(SVG).map((face) => face.name)).toEqual(['Latin Modern Roman'])
    expect(paperFacesIn('<svg><text font-family="Nunito">a</text></svg>')).toEqual([])
  })

  it('puts the used face into the SVG, inline, before anything else in its defs', async () => {
    const fetched = vi.fn(async () => new Response(new Uint8Array([1, 2, 3])))
    vi.stubGlobal('fetch', fetched)
    expect(await paperFontFaces(SVG)).toMatch(
      /^@font-face\{font-family:"Latin Modern Roman";src:url\(data:font\/otf;base64,AQID\) format\("opentype"\);\}$/
    )
    const holder = document.createElement('div')
    holder.innerHTML = SVG
    const svg = holder.querySelector('svg')
    if (!svg) {
      throw new Error('no svg')
    }
    await embedPaperFonts(svg)
    expect(svg.querySelector('defs > style')?.textContent).toContain('Latin Modern Roman')
    expect(fetched).toHaveBeenCalledTimes(1)
    const plain = document.createElement('div')
    plain.innerHTML = '<svg><text font-family="Liberation Sans">x</text></svg>'
    const other = plain.querySelector('svg')
    if (other) {
      await embedPaperFonts(other)
      expect(other.querySelector('style')).toBeNull()
    }
  })

  it('waits for a paper face to load before taking Excalidraw’s measure of its text', () => {
    const face = PAPER_FACES[0]
    const text = {
      id: 't',
      type: 'text',
      x: 0,
      y: 0,
      width: 40,
      height: 20,
      fontSize: 16,
      fontFamily: face.id
    }
    expect(textFont(text)).toBe(`16px "${face.name}"`)
    const { waiting } = keepWrittenTextSize([{ ...text, width: 30 }], [text], () => false)
    expect([...waiting.keys()]).toEqual([`16px "${face.name}"`])
  })
})
