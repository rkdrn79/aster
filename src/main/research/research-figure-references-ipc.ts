// The person's reference figures on this computer (the folder `figures refs` reads) and whether
// Codex can draw a concept image here: what the Figure agent's switches need from the main side.
import { execFile } from 'node:child_process'
import { readFile, stat } from 'node:fs/promises'
import { extname, isAbsolute, join, relative, resolve } from 'node:path'
import { app, ipcMain } from 'electron'
import { z } from 'zod'
import { mainProcessState } from '../startup/main-process-state'
import { callHarness } from './research-harness-ipc'

const MAX_IMAGE_BYTES = 20 * 1024 * 1024
const MAX_BASE64_CHARS = Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 4
const CODEX_TIMEOUT_MS = 10_000

const folderInput = z.object({ folder: z.string().max(4096).nullable() }).strict()
const addInput = z
  .object({
    folder: z.string().max(4096).nullable(),
    name: z.string().min(1).max(200),
    base64: z.string().min(1).max(MAX_BASE64_CHARS)
  })
  .strict()
const thumbnailInput = z
  .object({ folder: z.string().max(4096).nullable(), image: z.string().min(1).max(4096) })
  .strict()

const entrySchema = z.object({
  id: z.string().min(1).max(200),
  image: z.string().max(4096).nullable(),
  title: z.string().max(400).nullable(),
  year: z.number().int().nullable(),
  genre: z.string().max(80).nullable(),
  recipe: z.boolean()
})
const librarySchema = z.object({
  dir: z.string(),
  exists: z.boolean(),
  entries: z.array(entrySchema).max(2000)
})
const addedSchema = z.object({ id: z.string().min(1), image: z.string().min(1) })

export type FigureReferenceEntry = z.infer<typeof entrySchema>
export type FigureReferenceLibrary = {
  folder: string
  defaultFolder: string
  exists: boolean
  entries: FigureReferenceEntry[]
}

/** Aster's app-data folder of reference figures: the default the Settings row shows. */
export function defaultFigureReferenceFolder(): string {
  return join(app.getPath('userData'), 'figure-references')
}

function folderOf(input: string | null): string {
  const folder = input?.trim() ? input.trim() : defaultFigureReferenceFolder()
  if (!isAbsolute(folder)) {
    throw new Error('The reference folder must be an absolute path.')
  }
  return resolve(folder)
}

export async function figureReferenceLibrary(input: unknown): Promise<FigureReferenceLibrary> {
  const folder = folderOf(folderInput.parse(input).folder)
  const listed = librarySchema.parse(
    await callHarness('research-figures-refs.mjs', 'listReferenceLibrary', folder)
  )
  return {
    folder,
    defaultFolder: defaultFigureReferenceFolder(),
    exists: listed.exists,
    entries: listed.entries
  }
}

/** Copies one PNG or JPEG into the folder's img/, under an id made from its name. */
export async function addFigureReference(input: unknown): Promise<{ id: string; image: string }> {
  const parsed = addInput.parse(input)
  return addedSchema.parse(
    await callHarness(
      'research-figures-refs.mjs',
      'addReferenceImage',
      folderOf(parsed.folder),
      parsed.name,
      parsed.base64
    )
  )
}

const IMAGE_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg'
}

/** One reference image of the folder as a data URL, for the picker; null when it is not there. */
export async function figureReferenceThumbnail(input: unknown): Promise<string | null> {
  const parsed = thumbnailInput.parse(input)
  const folder = folderOf(parsed.folder)
  const image = resolve(parsed.image)
  const inside = relative(folder, image)
  const type = IMAGE_TYPES[extname(image).toLowerCase()]
  if (!type || inside.startsWith('..') || isAbsolute(inside)) {
    return null
  }
  const details = await stat(image).catch(() => null)
  if (!details?.isFile() || details.size > MAX_IMAGE_BYTES) {
    return null
  }
  return `data:${type};base64,${(await readFile(image)).toString('base64')}`
}

export type CodexImageGeneration = { available: boolean; reason: string | null }

/** What `codex features list` says about image_generation (a line "name  stage  enabled"). */
export function codexImageGenerationFromFeatures(output: string): CodexImageGeneration {
  const line = output.split('\n').find((entry) => /^image_generation\s/.test(entry.trim()))
  if (!line) {
    return {
      available: false,
      reason: 'This Codex CLI has no image generation (codex features list).'
    }
  }
  return /\sremoved\s/.test(` ${line} `)
    ? { available: false, reason: "This Codex CLI's image generation was removed." }
    : { available: true, reason: null }
}

let codexCheck: Promise<CodexImageGeneration> | null = null

/** The person's Codex command when they set one to a plain path (Settings → Agents), else codex. */
export function codexExecutable(override: string | undefined): string {
  const unquoted = override?.trim().replace(/^'(.*)'$/, '$1') ?? ''
  return isAbsolute(unquoted) ? unquoted : 'codex'
}

function runCodexFeatures(): Promise<CodexImageGeneration> {
  const override = mainProcessState.store?.getSettings().agentCmdOverrides?.codex
  return new Promise((done) => {
    execFile(
      codexExecutable(override),
      ['features', 'list'],
      { timeout: CODEX_TIMEOUT_MS, maxBuffer: 1024 * 1024, windowsHide: true },
      (error, stdout) => {
        if (error && !stdout) {
          const missing = Reflect.get(error, 'code') === 'ENOENT'
          done({
            available: false,
            reason: missing
              ? 'No Codex CLI on this computer: install Codex to use concept images.'
              : 'Codex did not answer `codex features list`.'
          })
          return
        }
        done(codexImageGenerationFromFeatures(String(stdout)))
      }
    )
  })
}

/** Whether a Codex CLI with image generation is on this computer; asked once per app run. */
export function codexImageGeneration(input: unknown): Promise<CodexImageGeneration> {
  const refresh = z
    .object({ refresh: z.boolean().optional() })
    .strict()
    .parse(input ?? {})
  if (!codexCheck || refresh.refresh) {
    codexCheck = runCodexFeatures()
  }
  return codexCheck
}

export function registerFigureReferenceIpcHandlers(): void {
  ipcMain.handle('researchFigures:referenceLibrary', (_event, input: unknown) =>
    figureReferenceLibrary(input)
  )
  ipcMain.handle('researchFigures:addReference', (_event, input: unknown) =>
    addFigureReference(input)
  )
  ipcMain.handle('researchFigures:referenceThumbnail', (_event, input: unknown) =>
    figureReferenceThumbnail(input)
  )
  ipcMain.handle('researchFigures:codexImageGeneration', (_event, input: unknown) =>
    codexImageGeneration(input)
  )
}
