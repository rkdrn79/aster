import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ResearchProjectRoot } from './research-project-files'
import { compileResearchProjectLatex } from './research-project-latex-compile'

const compiler = vi.hoisted(() => ({ resolve: vi.fn(), run: vi.fn() }))
vi.mock('../../shared/node-cli-command-resolution', () => ({
  resolveExecutableCommand: compiler.resolve
}))
vi.mock('./research-latex-process', () => ({ runLatexProcess: compiler.run }))

let workspace: string
let root: ResearchProjectRoot

beforeEach(async () => {
  workspace = await realpath(await mkdtemp(join(tmpdir(), 'aster-remote-tex-')))
  await mkdir(join(workspace, 'paper'))
  await writeFile(join(workspace, 'paper', 'main.tex'), '\\documentclass{article}')
  root = { path: workspace, authorize: async (path) => path }
  compiler.resolve.mockReset()
  compiler.run.mockReset()
  compiler.resolve.mockImplementation((name: string) =>
    name === 'latexmk' ? '/usr/bin/latexmk' : null
  )
})

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true })
})

describe('researchProject.latexCompile', () => {
  it('builds inside the owning workspace with latexmk and shell escape disabled', async () => {
    compiler.run.mockImplementation(async (spec: { args: string[] }) => {
      const out = spec.args.find((arg) => arg.startsWith('-outdir='))?.slice('-outdir='.length)
      if (!out) {
        throw new Error('Missing output directory')
      }
      await writeFile(join(out, 'main.pdf'), '%PDF-1.4\n')
      return { code: 0, outcome: 'exited', output: 'Built' }
    })

    const result = await compileResearchProjectLatex(root, 'paper/main.tex')

    if (result.status !== 'ok') {
      throw new Error(result.message)
    }
    expect(result).toMatchObject({ status: 'ok' })
    expect(result.status === 'ok' && result.pdfPath).toMatch(/^\.aster\/latex-build\/project\//)
    expect(compiler.run).toHaveBeenCalledWith(
      expect.objectContaining({
        program: '/usr/bin/latexmk',
        args: expect.arrayContaining(['-norc', '-pdf', '-no-shell-escape'])
      })
    )
  })

  it('refuses a source outside the registered workspace before launching a compiler', async () => {
    const result = await compileResearchProjectLatex(root, '../other/main.tex')
    expect(result.status).toBe('error')
    expect(compiler.run).not.toHaveBeenCalled()
  })
})
