import { app, BrowserWindow, ipcMain } from 'electron'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, readdir, rename, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, join } from 'node:path'
import { z } from 'zod'
import { resolveDesktopAuthorizedPath } from '../ipc/local-file-access-resolution'
import { mainProcessState } from '../startup/main-process-state'
import {
  EXCALIDRAW_FONT_FOLDERS,
  embedSvgFonts,
  figurePdfPageHtml,
  svgFontFamilies,
  svgHasEmbeddedFonts
} from './research-figure-pdf-page'
import { buildFigureTemplate, listFigureTemplates } from './research-figures-kit-ipc'

const MAX_SVG_CHARS = 40 * 1024 * 1024
const MAX_FILE_BASE64_CHARS = 64 * 1024 * 1024
const BINARY_EXTENSIONS = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.webp'])

const renderRequestSchema = z
  .object({
    svg: z.string().min(1).max(MAX_SVG_CHARS),
    widthIn: z.number().finite().min(0.1).max(100),
    heightIn: z.number().finite().min(0.1).max(100)
  })
  .strict()
const writeRequestSchema = z
  .object({
    filePath: z.string().min(1).max(4096),
    contentBase64: z.string().max(MAX_FILE_BASE64_CHARS)
  })
  .strict()

/** The fonts the renderer build copies next to its pages; the package's own in development. */
function excalidrawFontsDirectory(): string {
  const built = join(__dirname, '../renderer/excalidraw-assets/fonts')
  return existsSync(built)
    ? built
    : join(app.getAppPath(), 'node_modules/@excalidraw/excalidraw/dist/prod/fonts')
}

async function fontFaces(svg: string): Promise<{ family: string; woff2Base64: string }[]> {
  const root = excalidrawFontsDirectory()
  const faces: { family: string; woff2Base64: string }[] = []
  for (const family of svgFontFamilies(svg)) {
    const folder = join(root, EXCALIDRAW_FONT_FOLDERS[family])
    const files = (await readdir(folder).catch(() => [])).filter((name) => name.endsWith('.woff2'))
    for (const name of files.sort()) {
      faces.push({ family, woff2Base64: (await readFile(join(folder, name))).toString('base64') })
    }
  }
  return faces
}

let queue: Promise<unknown> = Promise.resolve()

/** Prints the page in a hidden, sandboxed window; never shown, so focus stays where it is. */
async function printFigurePdf(html: string, widthIn: number, heightIn: number): Promise<Buffer> {
  const folder = await mkdtemp(join(tmpdir(), 'aster-figure-'))
  const window = new BrowserWindow({
    show: false,
    width: Math.ceil(widthIn * 96) + 16,
    height: Math.ceil(heightIn * 96) + 16,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      partition: 'aster-figure-export'
    }
  })
  try {
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-navigate', (event) => event.preventDefault())
    const page = join(folder, 'figure.html')
    await writeFile(page, html, 'utf8')
    await window.loadFile(page)
    // Why: embedded fonts decode after load; printing earlier falls back to a system font.
    await window.webContents.executeJavaScript('document.fonts.ready.then(() => true)', true)
    return await window.webContents.printToPDF({
      pageSize: { width: widthIn, height: heightIn },
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      printBackground: true,
      preferCSSPageSize: true
    })
  } finally {
    window.destroy()
    await rm(folder, { recursive: true, force: true })
  }
}

/** The SVG with the app's fonts embedded, and a vector PDF exactly the figure's size. */
export async function renderFigureExports(input: unknown): Promise<{ svg: string; pdf: string }> {
  const { svg, widthIn, heightIn } = renderRequestSchema.parse(input)
  const portable = svgHasEmbeddedFonts(svg) ? svg : embedSvgFonts(svg, await fontFaces(svg))
  const run = queue.then(() =>
    printFigurePdf(figurePdfPageHtml(portable, widthIn, heightIn), widthIn, heightIn)
  )
  queue = run.catch(() => undefined)
  return { svg: portable, pdf: (await run).toString('base64') }
}

/** Writes an exported PDF or image into a project on this machine. */
export async function writeFigureFile(input: unknown): Promise<void> {
  const { filePath, contentBase64 } = writeRequestSchema.parse(input)
  if (!BINARY_EXTENSIONS.has(extname(filePath).toLowerCase())) {
    throw new Error('Figures writes only PDF and image exports.')
  }
  const store = mainProcessState.store
  if (!store) {
    throw new Error('Project storage is not ready. Try again after startup.')
  }
  const target = await resolveDesktopAuthorizedPath(filePath, store)
  await mkdir(dirname(target), { recursive: true })
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`
  try {
    await writeFile(temporary, Buffer.from(contentBase64, 'base64'))
    await rename(temporary, target)
  } finally {
    await rm(temporary, { force: true })
  }
}

const MAX_PART_CHARS = 8 * 1024 * 1024
const savePartSchema = z
  .object({
    name: z.string().min(1).max(80),
    library: z.string().min(1).max(MAX_PART_CHARS)
  })
  .strict()

/** The person's saved figure parts, for every project: the Figure kit reads the same folder. */
function userPartsDirectory(): string {
  return join(app.getPath('userData'), 'figure-library')
}

function partFileName(name: string): string {
  const slug = name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${slug || 'part'}.excalidrawlib`
}

/** Every saved user part file's text, oldest first. */
export async function listUserFigureParts(): Promise<{ file: string; text: string }[]> {
  const folder = userPartsDirectory()
  const names = (await readdir(folder).catch(() => [])).filter((name) =>
    name.endsWith('.excalidrawlib')
  )
  const parts: { file: string; text: string }[] = []
  for (const name of names.sort()) {
    parts.push({ file: name, text: await readFile(join(folder, name), 'utf8') })
  }
  return parts
}

/** Saves one part (an .excalidrawlib text) under its name's slug. */
export async function saveUserFigurePart(input: unknown): Promise<string> {
  const { name, library } = savePartSchema.parse(input)
  JSON.parse(library)
  const folder = userPartsDirectory()
  await mkdir(folder, { recursive: true })
  const file = join(folder, partFileName(name))
  await writeFile(file, library, 'utf8')
  return file
}

/** Deletes one saved user part by its file name (as listUserFigureParts gives it). */
export async function deleteUserFigurePart(input: unknown): Promise<void> {
  const { file } = z
    .object({ file: z.string().regex(/^[^/\\]+\.excalidrawlib$/) })
    .strict()
    .parse(input)
  await unlink(join(userPartsDirectory(), basename(file))).catch((cause: unknown) => {
    if (!(cause instanceof Error && 'code' in cause && cause.code === 'ENOENT')) {
      throw cause
    }
  })
}

export function registerResearchFiguresIpcHandlers(): void {
  ipcMain.handle('researchFigures:deleteUserPart', (_event, input: unknown) =>
    deleteUserFigurePart(input)
  )
  ipcMain.handle('researchFigures:listTemplates', () => listFigureTemplates())
  ipcMain.handle('researchFigures:buildTemplate', (_event, input: unknown) =>
    buildFigureTemplate(input)
  )
  ipcMain.handle('researchFigures:listUserParts', () => listUserFigureParts())
  ipcMain.handle('researchFigures:saveUserPart', (_event, input: unknown) =>
    saveUserFigurePart(input)
  )
  ipcMain.handle('researchFigures:renderExports', (_event, input: unknown) =>
    renderFigureExports(input)
  )
  ipcMain.handle('researchFigures:writeFile', (_event, input: unknown) => writeFigureFile(input))
}
