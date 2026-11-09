/**
 * Text measured before its font has loaded. Excalidraw's restore re-measures text in whatever
 * font the browser has; Nunito (the illustrative style) loads only once a scene uses it, so an
 * agent's first Nunito figure is measured in a narrower fallback. The canvas draws each text
 * into a box that wide plus half a font size over the screen's pixel ratio, so on a Retina
 * screen the last glyph ("warm" → "war") is cut off; exports, drawn as SVG, are not. The kit
 * measures with Chromium's own Nunito and Liberation Sans advances, so its size is kept until
 * the font is in. Pure apart from the `fontReady` check the caller passes.
 */

/** Excalidraw's font families by id (its `FONT_FAMILY`), as CSS names. */
const FAMILY_NAMES: Readonly<Record<number, string>> = {
  1: 'Virgil',
  2: 'Helvetica',
  3: 'Cascadia',
  5: 'Excalifont',
  6: 'Nunito',
  7: '"Lilita One"',
  8: '"Comic Shanns"',
  9: '"Liberation Sans"'
}

export type MeasuredText = {
  readonly id: string
  readonly type: string
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly text?: string
  readonly fontSize?: number
  readonly fontFamily?: number
}

/** The CSS font a text element draws in, for `document.fonts`; null for a family not listed. */
export function textFont(element: MeasuredText): string | null {
  const name = element.fontFamily === undefined ? undefined : FAMILY_NAMES[element.fontFamily]
  return name && element.fontSize ? `${element.fontSize}px ${name}` : null
}

const isMeasured = (value: unknown): value is MeasuredText =>
  typeof value === 'object' &&
  value !== null &&
  Reflect.get(value, 'type') === 'text' &&
  typeof Reflect.get(value, 'id') === 'string' &&
  [Reflect.get(value, 'width'), Reflect.get(value, 'height')].every(
    (size) => typeof size === 'number' && size > 0
  ) &&
  [Reflect.get(value, 'x'), Reflect.get(value, 'y')].every((at) => typeof at === 'number')

/**
 * The restored elements with each text whose font is not ready back at the size and place the
 * writer gave it (`written`, the scene as it came from the file), and the fonts to wait for.
 */
export function keepWrittenTextSize<T extends MeasuredText>(
  restored: readonly T[],
  written: readonly unknown[],
  fontReady: (font: string, text: string) => boolean
): { elements: T[]; waiting: Map<string, Set<string>> } {
  const byId = new Map(written.filter(isMeasured).map((element) => [element.id, element] as const))
  const waiting = new Map<string, Set<string>>()
  const elements = restored.map((element) => {
    const font = element.type === 'text' ? textFont(element) : null
    const before = byId.get(element.id)
    if (!font || !before || fontReady(font, element.text ?? '')) {
      return element
    }
    const ids = waiting.get(font) ?? new Set<string>()
    ids.add(element.id)
    waiting.set(font, ids)
    return {
      ...element,
      x: before.x,
      y: before.y,
      width: before.width,
      height: before.height,
      ...(typeof before.text === 'string' ? { text: before.text } : {})
    }
  })
  return { elements, waiting }
}
