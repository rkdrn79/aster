import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, realpath, rename, rm, stat } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { resolveExecutableCommand } from '../../shared/node-cli-command-resolution'
import { parseHostAuthorityKey } from '../../shared/host-authority'
import { isDescendantOrEqual } from '../ipc/filesystem-path-containment'
import {
  resolveDesktopAuthorizedPath,
  resolveLocalRequestPath
} from '../ipc/local-file-access-resolution'
import { mainProcessState } from '../startup/main-process-state'
import { readResearchDocument } from './research-repository'
import { runLatexProcess } from './research-latex-process'
import type {
  ResearchLatexCompileResult,
  ResearchLatexCompileTarget
} from '../../preload/api/research-latex-bridge'

// Why idle, not wall-clock: a first build downloads TeX packages for minutes while printing progress.
const IDLE_TIMEOUT_MS = 120_000
const MAX_BUILD_MS = 15 * 60_000
const MAX_DIAGNOSTIC_LENGTH = 12_000
const MAX_OUTPUT_CHARS = 4 * 1024 * 1024
const MAX_PDF_BYTES = 24 * 1024 * 1024

type ActiveBuild = {
  promise: Promise<ResearchLatexCompileResult>
  controller: AbortController
  listeners: Set<(text: string) => void>
}
const activeBuilds = new Map<string, ActiveBuild>()
const buildKeysById = new Map<string, string>()

function failure(message: string, output = ''): ResearchLatexCompileResult {
  return { status: 'error', message, output }
}

function buildKey(target: ResearchLatexCompileTarget): string {
  return 'experimentId' in target
    ? `experiment:${target.experimentId}`
    : `project:${target.workspacePath}\0${target.sourcePath}`
}

/** One build per manuscript; a second request joins it and streams the same output. */
export function compileResearchLatex(
  target: ResearchLatexCompileTarget,
  buildId?: string,
  onOutput?: (text: string) => void
): Promise<ResearchLatexCompileResult> {
  const key = buildKey(target)
  let build = activeBuilds.get(key)
  if (!build) {
    const controller = new AbortController()
    const listeners = new Set<(text: string) => void>()
    const promise = compileResearchLatexOnce(target, controller.signal, (text) => {
      for (const listener of listeners) {
        listener(text)
      }
    })
    build = { promise, controller, listeners }
    activeBuilds.set(key, build)
    void promise.then(
      () => activeBuilds.delete(key),
      () => activeBuilds.delete(key)
    )
  }
  const joined = build
  if (onOutput) {
    joined.listeners.add(onOutput)
  }
  if (buildId) {
    buildKeysById.set(buildId, key)
  }
  return joined.promise.finally(() => {
    if (onOutput) {
      joined.listeners.delete(onOutput)
    }
    if (buildId) {
      buildKeysById.delete(buildId)
    }
  })
}

/** Stops the engine behind `buildId`; false when that build already finished. */
export function cancelResearchLatex(buildId: string): boolean {
  const key = buildKeysById.get(buildId)
  const build = key ? activeBuilds.get(key) : undefined
  build?.controller.abort()
  return Boolean(build)
}

type ResolvedTarget = { workspacePath: string; sourcePath: string; buildScope: string }

async function resolveTarget(
  target: ResearchLatexCompileTarget
): Promise<ResolvedTarget | ResearchLatexCompileResult> {
  if (!('experimentId' in target)) {
    const store = mainProcessState.store
    if (!store) {
      return failure('Workspace storage is not ready. Try again after startup.')
    }
    // Why: a project without Experiments has no record; its folder must be a registered project.
    await resolveDesktopAuthorizedPath(target.workspacePath, store)
    return { ...target, buildScope: 'project' }
  }
  const document = await readResearchDocument()
  const experiment = document.experiments.find((record) => record.id === target.experimentId)
  if (!experiment?.manuscript) {
    return failure('Choose a main .tex file for this project first.')
  }
  const authority = parseHostAuthorityKey(experiment.hostId)
  if (authority?.endpoint.kind !== 'self' || authority.at !== 'local') {
    return {
      status: 'unsupported',
      message: 'PDF compilation currently runs on a local workspace only.',
      output: ''
    }
  }
  return {
    workspacePath: experiment.workspacePath,
    sourcePath: experiment.manuscript.sourcePath,
    buildScope: experiment.id
  }
}

async function compileResearchLatexOnce(
  target: ResearchLatexCompileTarget,
  signal: AbortSignal,
  onOutput: (text: string) => void
): Promise<ResearchLatexCompileResult> {
  try {
    const resolved = await resolveTarget(target)
    if ('status' in resolved) {
      return resolved
    }
    const store = mainProcessState.store
    if (!store) {
      return failure('Workspace storage is not ready. Try again after startup.')
    }
    const compiler = resolveExecutableCommand('tectonic')
    if (!compiler) {
      return {
        status: 'missing-compiler',
        message: 'Install Tectonic to compile LaTeX PDFs, then restart Aster.',
        output: ''
      }
    }
    const { workspacePath, sourcePath: sourceRelativePath, buildScope } = resolved
    if (
      !isAbsolute(workspacePath) ||
      isAbsolute(sourceRelativePath) ||
      sourceRelativePath.split(/[\\/]/).includes('..') ||
      extname(sourceRelativePath).toLowerCase() !== '.tex'
    ) {
      return failure('The main .tex file must be inside the project folder.')
    }
    const sourcePath = resolve(workspacePath, sourceRelativePath)
    const access = { kind: 'research-workspace', workspacePath }
    const source = await resolveLocalRequestPath(sourcePath, access, store, 'read')
    const workspace = await resolveLocalRequestPath(workspacePath, access, store, 'read')
    if (!isDescendantOrEqual(source, workspace) || !(await stat(source)).isFile()) {
      return failure('The main .tex file is missing or outside the project folder.')
    }

    const sourceKey = createHash('sha256').update(sourceRelativePath).digest('hex').slice(0, 12)
    // Keep the registered spelling for authorization; /tmp resolves to /private/tmp on macOS.
    const outputDir = join(workspacePath, '.aster', 'latex-build', buildScope, sourceKey)
    const authorizedOutput = await resolveLocalRequestPath(outputDir, undefined, store, 'write')
    if (!isDescendantOrEqual(authorizedOutput, workspace)) {
      return failure('The PDF output directory must stay inside the workspace.')
    }
    await mkdir(authorizedOutput, { recursive: true })
    const realOutput = await realpath(authorizedOutput)
    if (!isDescendantOrEqual(realOutput, workspace)) {
      return failure('The PDF output directory points outside the workspace.')
    }

    const pdfName = `${basename(source, extname(source))}.pdf`
    const pdfFile = join(realOutput, pdfName)
    const staging = await mkdtemp(join(realOutput, '.compile-'))
    let output: string
    try {
      const built = await runLatexProcess({
        program: compiler,
        // New profiles have no Tectonic cache. Missing TeX resources can be fetched
        // on first build; --untrusted still disables shell escape from the manuscript.
        // Default chatter prints the download and pass notes the progress line reads.
        args: [
          '--untrusted',
          '--synctex',
          '--chatter',
          'default',
          '--color',
          'never',
          '--outdir',
          staging,
          source
        ],
        cwd: dirname(source),
        signal,
        idleTimeoutMs: IDLE_TIMEOUT_MS,
        maxDurationMs: MAX_BUILD_MS,
        maxOutputChars: MAX_OUTPUT_CHARS,
        tailLength: MAX_DIAGNOSTIC_LENGTH,
        onOutput
      })
      output = built.output.trim()
      switch (built.outcome) {
        case 'cancelled':
          return { status: 'cancelled', message: 'Compilation cancelled.', output }
        case 'idle-timeout':
          return failure(
            `LaTeX compilation stopped after ${IDLE_TIMEOUT_MS / 1000} seconds without output.`,
            output
          )
        case 'max-duration':
          return failure(
            `LaTeX compilation stopped after ${MAX_BUILD_MS / 60_000} minutes.`,
            output
          )
        case 'output-limit':
          return failure('LaTeX printed too much output, so compilation was stopped.', output)
        case 'spawn-error':
          return failure(`Tectonic could not start. ${built.error ?? ''}`.trim(), output)
        case 'exited':
          break
      }
      if (built.code !== 0) {
        return failure('LaTeX compilation failed. Check the build log.', output)
      }
      const stagedPdf = join(staging, pdfName)
      const pdfStat = await stat(stagedPdf)
      if (!pdfStat.isFile() || pdfStat.size > MAX_PDF_BYTES) {
        return failure('The generated PDF is missing or exceeds the 24 MiB preview limit.', output)
      }
      await rename(stagedPdf, pdfFile)
      // Why kept beside the PDF: double-clicking the preview finds the TeX line through it.
      const synctexName = `${basename(pdfName, '.pdf')}.synctex.gz`
      await rename(join(staging, synctexName), join(realOutput, synctexName)).catch(() => undefined)
    } finally {
      await rm(staging, { recursive: true, force: true })
    }
    const relativePdfPath = relative(workspace, pdfFile)
    if (
      relativePdfPath === '' ||
      relativePdfPath === '..' ||
      relativePdfPath.startsWith(`..${sep}`) ||
      isAbsolute(relativePdfPath)
    ) {
      return failure('The generated PDF is outside the workspace.', output)
    }
    return {
      status: 'ok',
      pdfPath: relativePdfPath,
      builtAt: new Date().toISOString(),
      output
    }
  } catch (error) {
    return failure(error instanceof Error ? error.message : 'LaTeX compilation failed.')
  }
}
