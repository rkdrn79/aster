// `figures kit examples <name> --figure <slug>` (or `--page WxH`): the example laid out for the
// page the agent is drawing on. Every example reads `fig.page` and places its parts from the page's
// width and height, so the script printed is the one that fits; it is also run once on a scratch
// page of that size and the lint result is printed with it, so the agent sees whether it fits
// before copying it. Round 14 agents copied examples drawn for 3.25 × 1.6 in onto 1.1 in pages.
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { figurePage } from './research-figures-model.mjs'
import { KIT_EXAMPLES, examplesText } from './research-figures-kit-examples.mjs'
import {
  checkFigures,
  createFigure,
  listFigures,
  parseFigureSize,
  runFigure
} from './research-figures.mjs'

const UNITS = 144

/** The page to lay examples out for: `--page WxH`, else `--figure`'s page, else the only figure's. */
export async function examplePage(project, { page, figure } = {}) {
  if (page) {
    const parsed = parseFigureSize(page)
    return { widthIn: parsed.widthIn, heightIn: parsed.heightIn, from: `--page ${page}` }
  }
  let figures = []
  try {
    figures = (await listFigures(project)).figures
  } catch {
    return null
  }
  const chosen = figure
    ? figures.find((entry) => entry.slug === figure)
    : figures.length === 1
      ? figures[0]
      : null
  if (figure && !chosen) {
    throw new Error(
      `No figure ${figure}; figures: ${figures.map((entry) => entry.slug).join(', ')}`
    )
  }
  if (!chosen) {
    return null
  }
  const scene = JSON.parse(await readFile(path.join(project, chosen.scene), 'utf8'))
  const found = figurePage(scene.elements ?? [])
  return found
    ? { widthIn: found.widthIn, heightIn: found.heightIn, from: `figure ${chosen.slug}` }
    : null
}

/** Runs one example on a scratch page; returns `{ errors, warnings }` as lint codes. */
async function runOnPage(example, page) {
  const project = await mkdtemp(path.join(os.tmpdir(), 'aster-figures-example-'))
  try {
    await mkdir(path.join(project, '.aster'), { recursive: true })
    await writeFile(
      path.join(project, '.aster/project.json'),
      JSON.stringify({ schemaVersion: 2, manuscript: { source: 'paper/main.tex', pdf: null } })
    )
    const made = await createFigure(project, {
      slug: example.name,
      size: `${page.widthIn}x${page.heightIn}`
    })
    await writeFile(path.join(project, made.script), example.script)
    await runFigure(project, example.name)
    const [report] = (await checkFigures(project, example.name)).figures
    const codes = (list) => (list ?? []).map((entry) => entry.code)
    return { errors: codes(report.errors), warnings: codes(report.warnings) }
  } finally {
    await rm(project, { recursive: true, force: true })
  }
}

const counted = (codes, word) =>
  `${codes.length} ${word}${codes.length === 1 ? '' : 's'}${codes.length ? ` (${[...new Set(codes)].join(', ')})` : ''}`

/** The examples text for a page: the scripts with a header naming the page and how they fit. */
export async function examplesForPage(query, page) {
  if (!page) {
    return examplesText(query)
  }
  const size = `${page.widthIn} × ${page.heightIn} in (${Math.round(page.widthIn * UNITS)} × ${Math.round(page.heightIn * UNITS)} units, ${page.from})`
  if (!query) {
    return `${examplesText(null, { page })}`
  }
  const names = String(query)
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)
  const text = examplesText(query, { page })
  const notes = []
  for (const name of names) {
    const example = KIT_EXAMPLES.find((item) => item.name === name)
    try {
      const result = await runOnPage(example, page)
      notes.push(
        `// ${name} on your ${size}: ${counted(result.errors, 'error')}, ${counted(result.warnings, 'warning')}. It reads fig.page, so copied into your script it lays out on your page as run here.`
      )
    } catch (error) {
      notes.push(`// ${name} on your ${size} did not run: ${String(error.message).split('\n')[0]}`)
    }
  }
  return `${notes.join('\n')}\n${text}`
}
