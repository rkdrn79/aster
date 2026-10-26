import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, realpath, rename, rm, stat } from 'node:fs/promises'
import { basename, dirname, extname, join, relative, sep } from 'node:path'
import { resolveExecutableCommand } from '../../shared/node-cli-command-resolution'
import { normalizeRuntimeRelativePath } from '../runtime/runtime-relative-paths'
import { isDescendantOrEqual } from '../ipc/filesystem-path-containment'
import { runLatexProcess } from './research-latex-process'
import { resolveResearchWorkspacePath, type ResearchProjectRoot } from './research-project-files'
import type { ResearchLatexCompileResult } from '../../preload/api/research-latex-bridge'

const MAX_PDF_BYTES = 24 * 1024 * 1024
const IDLE_TIMEOUT_MS = 120_000
const MAX_BUILD_MS = 15 * 60_000

function failure(message: string, output = ''): ResearchLatexCompileResult {
  return { status: 'error', message, output }
}

/** Compiles on the workspace owner; the PDF stays under that workspace for normal remote reads. */
export async function compileResearchProjectLatex(
  root: ResearchProjectRoot,
  sourcePath: string
): Promise<ResearchLatexCompileResult> {
  try {
    const relativeSource = normalizeRuntimeRelativePath(sourcePath, root.path)
    if (extname(relativeSource).toLowerCase() !== '.tex') {
      return failure('Choose a .tex file inside the project.')
    }
    const source = await resolveResearchWorkspacePath(root, relativeSource)
    if (!(await stat(source)).isFile()) {
      return failure('The main .tex file is missing.')
    }
    const tectonic = resolveExecutableCommand('tectonic')
    const latexmk = tectonic ? null : resolveExecutableCommand('latexmk')
    if (!tectonic && !latexmk) {
      return {
        status: 'missing-compiler',
        message: 'Install Tectonic or latexmk on the workspace host to build PDFs.',
        output: ''
      }
    }
    const program = tectonic ?? latexmk
    if (!program) {
      return failure('No LaTeX compiler is available.')
    }
    const sourceKey = createHash('sha256').update(relativeSource).digest('hex').slice(0, 12)
    const outputPath = await root.authorize(
      join(root.path, '.aster', 'latex-build', 'project', sourceKey)
    )
    if (!isDescendantOrEqual(outputPath, root.path)) {
      return failure('The PDF output directory must stay inside the workspace.')
    }
    await mkdir(outputPath, { recursive: true })
    const outputDir = await realpath(outputPath)
    if (!isDescendantOrEqual(outputDir, root.path)) {
      return failure('The PDF output directory points outside the workspace.')
    }
    const pdfName = `${basename(source, extname(source))}.pdf`
    const staging = await mkdtemp(join(outputDir, '.compile-'))
    let output = ''
    try {
      const built = await runLatexProcess({
        program,
        args: tectonic
          ? [
              '--untrusted',
              '--synctex',
              '--chatter',
              'default',
              '--color',
              'never',
              '--outdir',
              staging,
              source
            ]
          : [
              '-norc',
              '-pdf',
              '-no-shell-escape',
              '-interaction=nonstopmode',
              '-halt-on-error',
              `-outdir=${staging}`,
              source
            ],
        cwd: dirname(source),
        signal: new AbortController().signal,
        idleTimeoutMs: IDLE_TIMEOUT_MS,
        maxDurationMs: MAX_BUILD_MS,
        maxOutputChars: 4 * 1024 * 1024,
        tailLength: 12_000,
        onOutput: () => undefined
      })
      output = built.output.trim()
      if (built.outcome !== 'exited' || built.code !== 0) {
        return failure(
          built.outcome === 'exited'
            ? 'LaTeX compilation failed. Check the build log.'
            : `LaTeX compilation stopped: ${built.outcome}.`,
          output
        )
      }
      const stagedPdf = join(staging, pdfName)
      const pdf = await stat(stagedPdf)
      if (!pdf.isFile() || pdf.size > MAX_PDF_BYTES) {
        return failure('The PDF is missing or exceeds the 24 MiB preview limit.', output)
      }
      await rename(stagedPdf, join(outputDir, pdfName))
      const synctexName = `${basename(pdfName, '.pdf')}.synctex.gz`
      await rename(join(staging, synctexName), join(outputDir, synctexName)).catch(() => undefined)
    } finally {
      await rm(staging, { recursive: true, force: true })
    }
    const pdfPath = relative(root.path, join(outputDir, pdfName))
    if (!pdfPath || pdfPath === '..' || pdfPath.startsWith(`..${sep}`)) {
      return failure('The generated PDF is outside the workspace.', output)
    }
    return {
      status: 'ok',
      pdfPath: pdfPath.split(sep).join('/'),
      builtAt: new Date().toISOString(),
      output
    }
  } catch (cause) {
    return failure(cause instanceof Error ? cause.message : 'LaTeX compilation failed.')
  }
}
