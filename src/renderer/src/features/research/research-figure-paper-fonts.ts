/**
 * The paper look's LaTeX faces in Excalidraw: Latin Modern Roman (Computer Modern) and TeX Gyre
 * Termes (Times), bundled unmodified under the GUST Font License. Excalidraw names a text's font
 * through its `FONT_FAMILY` table, so the faces join that table under numbers it leaves unused;
 * the canvas then draws them from the app's own @font-face (main.css). Exports carry the face
 * inside the SVG, so the file and the PDF made from it print the same type on any computer.
 */
import lmRomanUrl from '@/assets/fonts/paper/lmroman10-regular.otf?url'
import termesUrl from '@/assets/fonts/paper/texgyretermes-regular.otf?url'
import { PAPER_SERIF } from '../../../../research-harness/research-figures-paper-fonts.mjs'

export const PAPER_FACES = [
  { ...PAPER_SERIF.cm, url: lmRomanUrl },
  { ...PAPER_SERIF.times, url: termesUrl }
] as const

/** Adds the faces to Excalidraw's family table (its exported `FONT_FAMILY`); safe to repeat. */
export function registerPaperFonts(table: object): void {
  for (const face of PAPER_FACES) {
    if (Reflect.get(table, face.name) === undefined) {
      Reflect.set(table, face.name, face.id)
    }
  }
}

/** The faces an exported SVG's text is set in (Excalidraw writes the name first). */
export function paperFacesIn(svg: string): (typeof PAPER_FACES)[number][] {
  return PAPER_FACES.filter((face) => svg.includes(`font-family="${face.name}`))
}

const encoded = new Map<string, Promise<string>>()

async function fontData(url: string): Promise<string> {
  const response = await fetch(url)
  const bytes = new Uint8Array(await response.arrayBuffer())
  let binary = ''
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000))
  }
  return `data:font/otf;base64,${window.btoa(binary)}`
}

/** The @font-face rules for the paper faces an SVG uses, with each face inline. */
export async function paperFontFaces(svg: string): Promise<string> {
  const rules = await Promise.all(
    paperFacesIn(svg).map(async (face) => {
      const pending = encoded.get(face.url) ?? fontData(face.url)
      encoded.set(face.url, pending)
      return `@font-face{font-family:"${face.name}";src:url(${await pending}) format("opentype");}`
    })
  )
  return rules.join('')
}

/** Puts the paper faces an exported SVG element uses into its <defs>, before anything else. */
export async function embedPaperFonts(svg: SVGSVGElement): Promise<void> {
  const css = await paperFontFaces(svg.outerHTML)
  if (!css) {
    return
  }
  const namespace = 'http://www.w3.org/2000/svg'
  const style = document.createElementNS(namespace, 'style')
  style.textContent = css
  let defs = svg.querySelector('defs')
  if (!defs) {
    defs = document.createElementNS(namespace, 'defs')
    svg.prepend(defs)
  }
  defs.prepend(style)
}
