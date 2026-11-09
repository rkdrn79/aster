import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'
import { callHarness, researchHarnessDirectory } from './research-harness-ipc'

const templateSchema = z
  .object({
    name: z.string().regex(/^[a-z][a-z0-9-]{0,40}$/),
    style: z
      .string()
      .regex(/^[a-z]{1,20}$/)
      .nullable(),
    accent: z
      .string()
      .regex(/^[a-z]{1,20}$/)
      .nullable()
  })
  .strict()
const templateTableSchema = z.record(z.string(), z.tuple([z.unknown(), z.string(), z.string()]))

async function harnessModule(file: string): Promise<unknown> {
  return import(pathToFileURL(path.join(researchHarnessDirectory(), file)).href)
}

/** The kit's module templates (transformer, LoRA, diffusion, …) and what each draws. */
export async function listFigureTemplates(): Promise<{ name: string; description: string }[]> {
  const loaded = await harnessModule('research-figures-templates.mjs')
  const table = templateTableSchema.parse(
    typeof loaded === 'object' && loaded !== null ? Reflect.get(loaded, 'TEMPLATES') : null
  )
  return Object.entries(table).map(([name, [, description]]) => ({ name, description }))
}

/**
 * One template drawn by the kit in a figure's style, as a scene's text: the kit needs Node (files,
 * MathJax, photos), so the canvas asks for it here and places the elements itself.
 */
export async function buildFigureTemplate(input: unknown): Promise<string> {
  const { name, style, accent } = templateSchema.parse(input)
  const folder = await mkdtemp(path.join(tmpdir(), 'aster-figure-template-'))
  try {
    const file = path.join(folder, 'template.excalidraw')
    const scene = await callHarness(
      'research-figures-model.mjs',
      'newFigureScene',
      { widthIn: 6.75, heightIn: 6 },
      undefined,
      style
    )
    await writeFile(file, JSON.stringify(scene), 'utf8')
    const kit = await harnessModule('research-figures-kit.mjs')
    const open: unknown =
      typeof kit === 'object' && kit !== null ? Reflect.get(kit, 'openFigure') : null
    if (typeof open !== 'function') {
      throw new Error('This build does not include the figure kit.')
    }
    const figure: unknown = await open(file)
    const call = (method: string, ...args: unknown[]): unknown => {
      const fn: unknown =
        typeof figure === 'object' && figure !== null ? Reflect.get(figure, method) : undefined
      if (typeof fn !== 'function') {
        throw new Error('This build does not include the figure kit.')
      }
      return Reflect.apply(fn, figure, args)
    }
    call('style', style ?? 'neutral', accent ? { accent } : {})
    call('template', name, { id: name, x: 24, y: 24 })
    await call('save')
    return await readFile(file, 'utf8')
  } finally {
    await rm(folder, { recursive: true, force: true })
  }
}
