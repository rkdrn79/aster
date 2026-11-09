import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const authorized = vi.hoisted(() => ({ path: '', userData: '' }))
vi.mock('electron', () => ({
  app: { getAppPath: () => '/app', getPath: () => authorized.userData },
  BrowserWindow: vi.fn(),
  ipcMain: { handle: vi.fn() }
}))
vi.mock('../startup/main-process-state', () => ({ mainProcessState: { store: {} } }))
vi.mock('../ipc/local-file-access-resolution', () => ({
  resolveDesktopAuthorizedPath: vi.fn(async (path: string) => {
    if (!path.startsWith(authorized.path)) {
      throw new Error('Access denied')
    }
    return path
  })
}))

import {
  embedSvgFonts,
  figurePdfPageHtml,
  svgFontFamilies,
  svgHasEmbeddedFonts
} from './research-figure-pdf-page'
import {
  listUserFigureParts,
  renderFigureExports,
  saveUserFigurePart,
  writeFigureFile
} from './research-figures-ipc'

const SVG =
  '<svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 468 288" width="468" height="288"><text font-family="Liberation Sans, Xiaolai, Segoe UI Emoji">Encoder</text><text font-family="Excalifont, Xiaolai">x</text><text font-family="Helvetica">y</text></svg>'

describe('figure PDF page', () => {
  it('finds the bundled font families an SVG uses and embeds them', () => {
    expect(svgFontFamilies(SVG)).toEqual(['Excalifont', 'Liberation Sans'])
    expect(svgHasEmbeddedFonts(SVG)).toBe(false)
    const embedded = embedSvgFonts(SVG, [{ family: 'Liberation Sans', woff2Base64: 'AAAA' }])
    expect(embedded).toMatch(
      /^<svg[^>]*><defs><style>@font-face\{font-family:"Liberation Sans";src:url\(data:font\/woff2;base64,AAAA\)/
    )
    expect(svgHasEmbeddedFonts(embedded)).toBe(true)
  })

  it('prints one page exactly the figure size, with scripts off', () => {
    const html = figurePdfPageHtml(SVG, 3.25, 2)
    expect(html).toContain('@page{size:3.25in 2in;margin:0}')
    expect(html).toContain('<svg width="3.25in" height="2in" version="1.1"')
    expect(html).not.toContain('width="468"')
    expect(html).toContain("script-src 'none'")
  })
})

describe('figure IPC input', () => {
  let folder = ''
  afterEach(async () => {
    if (folder) {
      await rm(folder, { recursive: true, force: true })
    }
  })

  it('writes PDF and image exports inside a project only', async () => {
    folder = await mkdtemp(join(tmpdir(), 'aster-figures-ipc-'))
    authorized.path = folder
    const target = join(folder, 'paper/figures/method.pdf')
    await writeFigureFile({
      filePath: target,
      contentBase64: Buffer.from('%PDF-1.7').toString('base64')
    })
    expect(await readFile(target, 'utf8')).toBe('%PDF-1.7')
    await expect(
      writeFigureFile({ filePath: join(folder, 'paper/main.tex'), contentBase64: 'AAAA' })
    ).rejects.toThrow(/only PDF and image/)
    await expect(
      writeFigureFile({ filePath: '/etc/figure.png', contentBase64: 'AAAA' })
    ).rejects.toThrow(/Access denied/)
  })

  it('refuses a render request with a bad size', async () => {
    await expect(renderFigureExports({ svg: SVG, widthIn: 0, heightIn: 2 })).rejects.toThrow()
    await expect(renderFigureExports({ svg: '', widthIn: 3, heightIn: 2 })).rejects.toThrow()
  })
})

describe('saved figure parts', () => {
  it("keeps the person's parts in the app data folder the Figure kit reads", async () => {
    authorized.userData = await mkdtemp(join(tmpdir(), 'aster-parts-'))
    try {
      const library = JSON.stringify({ type: 'excalidrawlib', libraryItems: [] })
      const file = await saveUserFigurePart({ name: 'Encoder pair!', library })
      expect(file).toBe(join(authorized.userData, 'figure-library', 'encoder-pair.excalidrawlib'))
      expect(await listUserFigureParts()).toEqual([
        { file: 'encoder-pair.excalidrawlib', text: library }
      ])
      await expect(saveUserFigurePart({ name: 'x', library: 'not json' })).rejects.toThrow()
    } finally {
      await rm(authorized.userData, { recursive: true, force: true })
    }
  })
})
