import { create } from 'zustand'
import { parseFigureText } from './research-figure-document'
import { restoreFigureText } from './research-figure-history'
import type { FigureTarget } from './research-figures-export'
import {
  deleteProjectPath,
  listProjectDirectory,
  readProjectText,
  writeProjectText
} from './research-project-files'

/** Whether the quick actions ask for three variants instead of changing the figure. */
export const useFigureVariantsMode = create<{ on: boolean }>(() => ({ on: false }))

export function setFigureVariantsMode(on: boolean): void {
  useFigureVariantsMode.setState({ on })
}

/** `<figures folder>/.variants/<slug>/`, where an agent draws v1..v3 (kept out of Git). */
export function figureVariantsFolder(target: Pick<FigureTarget, 'folder' | 'slug'>): string {
  return `${target.folder}/.variants/${target.slug}`
}

export type FigureVariant = { name: string; text: string }

/** Keeps the variants folder out of Git before the agent writes into it. */
export async function prepareFigureVariants(target: FigureTarget): Promise<void> {
  const root = `${target.folder}/.variants`
  const entries = await listProjectDirectory(target.owner, root)
  if (!entries?.some((entry) => entry.name === '.gitignore')) {
    await writeProjectText(target.owner, `${root}/.gitignore`, '*\n')
  }
}

/** The finished variants (v1, v2, v3 that open as figures), in order. */
export async function readFigureVariants(target: FigureTarget): Promise<FigureVariant[]> {
  const folder = figureVariantsFolder(target)
  const entries = (await listProjectDirectory(target.owner, folder)) ?? []
  const names = entries
    .filter((entry) => !entry.isDirectory && /^v[1-3]\.excalidraw$/.test(entry.name))
    .map((entry) => entry.name)
    .sort()
  const variants: FigureVariant[] = []
  for (const name of names) {
    const text = await readProjectText(target.owner, `${folder}/${name}`).catch(() => null)
    if (text !== null && !parseFigureText(text).issues.length) {
      variants.push({ name: name.replace(/\.excalidraw$/, ''), text })
    }
  }
  return variants
}

/** Drops every variant of the figure. */
export async function discardFigureVariants(target: FigureTarget): Promise<void> {
  await deleteProjectPath(target.owner, figureVariantsFolder(target), true)
}

/** Makes one variant the figure (its current version stays in History), then drops the rest. */
export async function adoptFigureVariant(
  target: FigureTarget,
  variant: FigureVariant
): Promise<string | null> {
  const failure = await restoreFigureText(
    target,
    variant.text,
    `Before adopting variant ${variant.name.slice(1)}`
  )
  if (!failure) {
    await discardFigureVariants(target).catch(() => undefined)
  }
  return failure
}
