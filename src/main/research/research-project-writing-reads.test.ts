import { execFileSync } from 'node:child_process'
import { appendFile, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  layoutRelativePaths,
  libraryPaths,
  runPaths
} from '../../research-harness/research-layout.mjs'
import type { ResearchProjectRoot } from './research-project-files'
import { readResearchProjectClaimsAudit } from './research-project-claims-read'
import { readResearchProjectLibrary } from './research-project-library-read'

const CLI = join(import.meta.dirname, '..', '..', 'research-harness', 'cli.mjs')
const TRAIN_SCRIPT = `console.log('ASTER_METRIC ' + JSON.stringify({ step: 1, split: 'test', metrics: { acc: 0.8123 } }))`
const MANUSCRIPT = String.raw`\documentclass{article}
\begin{document}
Our method reaches 81.2\% accuracy.
The baseline gets 0.734 on the same split.
\end{document}
`
const BIBLIOGRAPHY = String.raw`@string{neurips = "Advances in Neural Information Processing Systems"}
@inproceedings{vaswani2017attention,
  title = {Attention Is {All} You Need},
  author = "Vaswani, Ashish and Shazeer, Noam",
  booktitle = neurips,
  year = 2017,
}
@article{he2016deep, title={Deep Residual Learning}, journal={CVPR}, doi={10.1109/CVPR.2016.90},
  file={:papers/resnet-paper.pdf:PDF}}
@article{broken, title = {Unclosed
@misc{li2020, title={Short key}}
`

let parent: string
let project: string
let bare: string
let root: ResearchProjectRoot

function harness(target: string, args: string[], command: string[] = []): void {
  const exec = command.length > 0 ? ['--', ...command] : []
  execFileSync(process.execPath, [CLI, ...args, '--project', target, ...exec], {
    cwd: target,
    stdio: 'pipe'
  })
}

function rootOf(path: string): ResearchProjectRoot {
  return { path, authorize: (target) => realpath(target).catch(() => target) }
}

beforeAll(async () => {
  parent = await realpath(await mkdtemp(join(tmpdir(), 'aster-research-writing-')))
  project = join(parent, 'project')
  bare = join(parent, 'bare')
  await mkdir(project)
  await mkdir(bare)
  harness(bare, ['init'])
  harness(project, ['init'])
  harness(project, ['experiment', '--name', 'LoRA r16'])
  harness(
    project,
    ['run', 'exec', '--experiment', 'lora-r16', '--id', 'seed-1'],
    [process.execPath, '-e', TRAIN_SCRIPT]
  )
  const layout = layoutRelativePaths(project)
  await writeFile(join(project, layout.manuscriptSource), MANUSCRIPT)
  harness(project, [
    'claim',
    'add',
    '--text',
    'Accuracy is 81.2%',
    '--run',
    'lora-r16/seed-1',
    '--metric',
    'acc',
    '--format',
    'percent:1',
    '--file',
    layout.manuscriptSource,
    '--line',
    '3'
  ])

  await writeFile(join(project, layout.bibliography), BIBLIOGRAPHY)
  const papers = libraryPaths(project).papers
  await mkdir(join(papers, 'notes'), { recursive: true })
  for (const name of ['vaswani2017attention.pdf', 'resnet-paper.pdf', 'li2020a.pdf']) {
    await writeFile(join(papers, name), '%PDF-1.4')
  }
  await writeFile(join(papers, 'notes', 'unrelated.pdf'), '%PDF-1.4')
  await writeFile(join(papers, 'readme.txt'), 'not a paper')
  await writeFile(
    libraryPaths(project).library,
    JSON.stringify({
      schemaVersion: 1,
      papers: [
        { key: 'he2016deep', status: 'read', tags: ['vision'], notes: 'classic' },
        { pdfPath: `${layout.papers}/vaswani2017attention.pdf`, status: 'reading' },
        'not a paper'
      ]
    })
  )
  root = rootOf(project)
}, 60_000)

afterAll(async () => {
  await rm(parent, { recursive: true, force: true })
})

describe('researchProject.claimsAudit', () => {
  it('audits claims with their manuscript line and lists numbers no claim backs', async () => {
    const layout = layoutRelativePaths(project)
    const result = await readResearchProjectClaimsAudit(root)

    expect(result.manuscript).toMatchObject({
      source: layout.manuscriptSource,
      pdf: layout.manuscriptPdf,
      pdfFile: { status: 'absent' }
    })
    expect(result.claims.status === 'present' && result.claims.value.claims).toEqual([
      expect.objectContaining({
        id: 'claim-1',
        status: 'verified',
        location: { file: layout.manuscriptSource, line: 3 },
        evidence: [
          expect.objectContaining({ run: 'lora-r16/seed-1', metric: 'acc', recordedValue: 0.8123 })
        ]
      })
    ])
    expect(result.unbackedNumbers).toMatchObject({
      status: 'present',
      value: { numbers: 2, backed: 1, omitted: 0, unbacked: [{ text: '0.734', line: 4 }] }
    })
  })

  it('reports a changed metric as a mismatch and a built PDF with its size', async () => {
    const layout = layoutRelativePaths(project)
    await writeFile(join(project, layout.manuscriptPdf), '%PDF-1.4 built')
    await appendFile(
      runPaths(project, 'lora-r16', 'seed-1').metrics,
      `${JSON.stringify({ schemaVersion: 1, step: 2, split: 'test', metrics: { acc: 0.9 } })}\n`
    )

    const result = await readResearchProjectClaimsAudit(root)

    expect(result.manuscript.pdfFile).toMatchObject({ status: 'present', value: { bytes: 14 } })
    expect(result.claims.status === 'present' && result.claims.value.claims[0]?.status).toBe(
      'mismatch'
    )
  })

  it('reads a project without a claims ledger as absent, not an error', async () => {
    const result = await readResearchProjectClaimsAudit(rootOf(bare))

    expect(result.claims).toEqual({ status: 'absent' })
    expect(result.unbackedNumbers.status).toBe('present')
  })
})

describe('researchProject.libraryRead', () => {
  it('parses the bib, matches PDFs by file field and key, and merges library.json', async () => {
    const papers = layoutRelativePaths(project).papers
    const result = await readResearchProjectLibrary(root)

    expect(result.bibliography.status === 'present' && result.bibliography.value).toMatchObject({
      malformedEntries: 1,
      truncated: false,
      entries: [
        {
          key: 'vaswani2017attention',
          type: 'inproceedings',
          title: 'Attention Is All You Need',
          authors: 'Vaswani, Ashish and Shazeer, Noam',
          year: '2017',
          venue: 'Advances in Neural Information Processing Systems',
          pdfs: [`${papers}/vaswani2017attention.pdf`],
          status: 'reading'
        },
        {
          key: 'he2016deep',
          venue: 'CVPR',
          doi: '10.1109/CVPR.2016.90',
          pdfs: [`${papers}/resnet-paper.pdf`],
          status: 'read',
          tags: ['vision'],
          notes: 'classic'
        },
        // `li2020a.pdf` names another paper, so the shorter key must not claim it.
        { key: 'li2020', pdfs: [], status: null }
      ]
    })
    const pdfs = result.papers.status === 'present' ? result.papers.value.pdfs : []
    expect(
      Object.fromEntries(pdfs.map((pdf) => [pdf.path, [pdf.entryKey, pdf.matchedBy]]))
    ).toEqual({
      [`${papers}/vaswani2017attention.pdf`]: ['vaswani2017attention', 'key-in-name'],
      [`${papers}/resnet-paper.pdf`]: ['he2016deep', 'file-field'],
      [`${papers}/li2020a.pdf`]: [null, null],
      [`${papers}/notes/unrelated.pdf`]: [null, null]
    })
    expect(result.metadata).toEqual({ status: 'present', value: { papers: 3 } })
  })

  it('reads a project with an empty bib and no library.json', async () => {
    const result = await readResearchProjectLibrary(rootOf(bare))

    expect(result.bibliography).toMatchObject({ status: 'present', value: { entries: [] } })
    expect(result.papers).toMatchObject({ status: 'present', value: { pdfs: [] } })
    expect(result.metadata).toEqual({ status: 'absent' })
  })

  it('finds an existing paper/main.bib without an Aster catalog', async () => {
    const existing = join(parent, 'existing-paper')
    await mkdir(join(existing, 'paper'), { recursive: true })
    await writeFile(join(existing, 'paper', 'main.bib'), BIBLIOGRAPHY)

    const result = await readResearchProjectLibrary(rootOf(existing))

    expect(result.bibliographyPath).toBe('paper/main.bib')
    expect(result.bibliography.status).toBe('present')
    expect(
      result.bibliography.status === 'present' && result.bibliography.value.entries
    ).toHaveLength(3)
  })
})
