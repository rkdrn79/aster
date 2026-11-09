/** Excalidraw's font families and the folder of its bundled fonts each one lives in. */
export const EXCALIDRAW_FONT_FOLDERS: Record<string, string> = {
  'Liberation Sans': 'Liberation',
  Excalifont: 'Excalifont',
  Nunito: 'Nunito',
  Cascadia: 'Cascadia',
  Virgil: 'Virgil',
  'Lilita One': 'Lilita',
  'Comic Shanns': 'ComicShanns'
}

/** The first family of every `font-family` in an Excalidraw SVG that the app bundles. */
export function svgFontFamilies(svg: string): string[] {
  const families = new Set<string>()
  for (const match of svg.matchAll(/font-family(?:="|:\s*)([^";,]+)/g)) {
    const family = match[1].trim().replace(/^['"]|['"]$/g, '')
    if (Object.hasOwn(EXCALIDRAW_FONT_FOLDERS, family)) {
      families.add(family)
    }
  }
  return [...families].sort()
}

/** True once Excalidraw itself embedded the fonts (it can when it could fetch them). */
export function svgHasEmbeddedFonts(svg: string): boolean {
  return /@font-face/.test(svg)
}

/** Adds `@font-face` rules right after the opening `<svg …>` tag. */
export function embedSvgFonts(
  svg: string,
  faces: readonly { family: string; woff2Base64: string }[]
): string {
  if (!faces.length) {
    return svg
  }
  const css = faces
    .map(
      (face) =>
        `@font-face{font-family:"${face.family}";src:url(data:font/woff2;base64,${face.woff2Base64}) format("woff2")}`
    )
    .join('')
  return svg.replace(/<svg\b[^>]*>/, (open) => `${open}<defs><style>${css}</style></defs>`)
}

function inches(value: number): string {
  return `${Math.round(value * 10_000) / 10_000}in`
}

/**
 * One page exactly the figure's size; `script-src 'none'` keeps anything inside the SVG inert.
 * The SVG is scaled by its viewBox, so scene units map to the printed size.
 */
export function figurePdfPageHtml(svg: string, widthIn: number, heightIn: number): string {
  const width = inches(widthIn)
  const height = inches(heightIn)
  const sized = svg.replace(/<svg\b[^>]*>/, (open) =>
    open
      .replace(/\swidth="[^"]*"/, '')
      .replace(/\sheight="[^"]*"/, '')
      .replace(/^<svg/, `<svg width="${width}" height="${height}"`)
  )
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data: blob:; script-src 'none'">`,
    `<style>@page{size:${width} ${height};margin:0}html,body{margin:0;padding:0;background:transparent}svg{display:block}</style>`,
    `</head><body>${sized}</body></html>`
  ].join('')
}
