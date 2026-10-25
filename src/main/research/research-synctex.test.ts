import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { afterEach, describe, expect, it } from 'vitest'
import { parseSynctex, synctexSourceAt, synctexSourceRanges } from './research-synctex'
import { synctexPdfLocation } from './research-synctex-forward'

const tectonicAvailable = spawnSync('tectonic', ['--version'], { encoding: 'utf8' }).status === 0

// Blank lines end each paragraph, so every paragraph gets its own baselines.
const MANUSCRIPT = [
  '\\documentclass{article}',
  '\\begin{document}',
  '\\section{Alpha}',
  'Alpha paragraph sits at the top of the first page.',
  '',
  '\\vspace{12cm}',
  '',
  'Beta paragraph sits far below it on the same page.',
  '\\newpage',
  'Gamma paragraph opens the second page.',
  '\\end{document}',
  ''
].join('\n')

// One paragraph over source lines 4-7, then a subfile whose paragraph TeX boxes under main.tex.
const WRAPPED = [
  '\\documentclass{article}',
  '\\begin{document}',
  '\\section{Intro}',
  'First sentence of the intro paragraph is written here and it goes on',
  'for a while so that the paragraph wraps over several lines in the PDF',
  'output, which lets us see which source line each PDF line maps to when',
  'we ask SyncTeX about it. The last source line of this paragraph ends now.',
  '',
  '\\input{sections/method}',
  '\\end{document}',
  ''
].join('\n')
const METHOD = [
  '\\section{Method}',
  'Method text on line two of the subfile, long enough to wrap onto a second',
  'line of output in the compiled document so we can check the mapping.',
  ''
].join('\n')

const roots: string[] = []
afterEach(() => {
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }))
})

function build(files: Record<string, string>): ReturnType<typeof parseSynctex> {
  const root = mkdtempSync(join(tmpdir(), 'aster-synctex-'))
  roots.push(root)
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(join(root, name, '..'), { recursive: true })
    writeFileSync(join(root, name), text)
  }
  const build = spawnSync(
    'tectonic',
    ['--untrusted', '--synctex', '--chatter', 'minimal', '--outdir', root, join(root, 'main.tex')],
    { encoding: 'utf8', timeout: 120_000 }
  )
  expect(build.status, build.stderr).toBe(0)
  return parseSynctex(gunzipSync(readFileSync(join(root, 'main.synctex.gz'))).toString('utf8'))
}

/** Source lines met walking down a page at a fixed x, in order, without repeats. */
function linesDownPage(document: ReturnType<typeof parseSynctex>, page: number): number[] {
  const lines: number[] = []
  for (let y = 0; y <= 842; y += 6) {
    const line = synctexSourceAt(document, page, 250, y)?.line
    if (line !== undefined && lines.at(-1) !== line) {
      lines.push(line)
    }
  }
  return lines
}

describe.skipIf(!tectonicAvailable)('SyncTeX reverse lookup on a real Tectonic build', () => {
  it('maps spots on each page back to the lines that typeset them', () => {
    const document = build({ 'main.tex': MANUSCRIPT })
    const firstPage = linesDownPage(document, 1)
    const secondPage = linesDownPage(document, 2)

    // Section heading, then Alpha, then Beta 12cm lower; Gamma only on page two.
    // In first-seen order; the page-number footer belongs to \newpage and is skipped here.
    expect([...new Set(firstPage)].filter((line) => [3, 4, 8].includes(line))).toEqual([3, 4, 8])
    expect(firstPage).not.toContain(10)
    expect(secondPage).toContain(10)
    expect(synctexSourceAt(document, 1, 150, 10)?.input).toContain('main.tex')
  }, 150_000)

  it('follows wrapped paragraphs and subfiles in both directions', () => {
    const document = build({
      'main.tex': WRAPPED,
      'sections/method.tex': METHOD
    })
    const tagOf = (suffix: string): number =>
      [...document.inputs].find(([, path]) => path.endsWith(suffix))?.[0] ?? -1
    const main = tagOf('/main.tex')
    const method = tagOf('/sections/method.tex')
    // Paragraph line boxes record the line that ended the paragraph; find them by that.
    const lineBoxes = (
      input: number,
      line: number
    ): { x: number; y: number; width: number; height: number }[] =>
      (document.pages.get(1) ?? [])
        .filter(
          (node) =>
            node.kind === '(' &&
            node.input === input &&
            node.line === line &&
            node.width > 100 &&
            node.height > 0 &&
            node.y < 600
        )
        .map((node) => ({
          x: node.x,
          y: node.y - node.height,
          width: node.width,
          height: node.height + node.depth
        }))
    const intro = lineBoxes(main, 8)
    const subfile = lineBoxes(main, 10)
    expect(intro.length).toBeGreaterThanOrEqual(3)
    expect(subfile.length).toBeGreaterThanOrEqual(2)

    // Clicking across every intro line never lands on the blank line or another file.
    const clicked = new Set<string>()
    for (const box of intro) {
      for (let x = box.x + 4; x < box.x + box.width; x += 15) {
        const hit = synctexSourceAt(document, 1, x, box.y + box.height / 2)
        clicked.add(`${hit?.input.split('/').at(-1)}:${hit?.line}`)
      }
    }
    expect([...clicked].sort()).toEqual(['main.tex:4', 'main.tex:5', 'main.tex:6', 'main.tex:7'])
    const subfileHit = synctexSourceAt(document, 1, subfile[0].x + 30, subfile[0].y + 5)
    expect(subfileHit?.input).toMatch(/sections\/method\.tex$/)
    expect(subfileHit?.line).toBe(2)

    // A selection over whole lines maps to exactly the source lines they came from.
    expect(
      synctexSourceRanges(document, 1, intro).map((range) => [range.startLine, range.endLine])
    ).toEqual([[4, 7]])
    expect(synctexSourceRanges(document, 1, subfile).map((range) => range.input)).toEqual([
      document.inputs.get(method)
    ])

    // Source line 5 starts mid-way through the first PDF line and wraps onto the second.
    const forward = synctexPdfLocation(document, new Set([main]), 5)
    expect(forward?.pageNumber).toBe(1)
    expect(forward?.boxes).toHaveLength(2)
    expect(forward?.boxes[0].x).toBeGreaterThan(intro[0].x + 50)
    expect(forward?.boxes[0].y).toBeCloseTo(intro[0].y, 0)
    // The line's last word has no node of its own, yet stays inside the highlight.
    expect((forward?.boxes[0].x ?? 0) + (forward?.boxes[0].width ?? 0)).toBeCloseTo(
      intro[0].x + intro[0].width,
      0
    )
    expect(forward?.boxes[1].x).toBeCloseTo(intro[1].x, 0)
    const forwardMethod = synctexPdfLocation(document, new Set([method]), 3)
    expect(forwardMethod?.boxes[0].y).toBeCloseTo(subfile[1].y, 0)
  }, 150_000)
})
