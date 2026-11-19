import { createBrowserUuid } from '@/lib/browser-uuid'
import { runtimeRpcTargetForAuthorityKey } from '@/runtime/runtime-client-target'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { authorityKey, parseHostAuthorityKey } from '../../../../shared/host-authority'
import type { ResearchLatexCompileResult } from '../../../../preload/api/research-latex-bridge'
import { assembleRebuttalLatex } from '../../../../research-harness/research-rebuttal-latex.mjs'
import { resolveManuscriptFile } from './research-writing-source'
import { readManuscriptPdf } from './research-pdf-file'
import type { PdfDocumentSource } from '@/components/editor/pdf-document-source'
import { writeRebuttalOutput } from './research-rebuttal-mutations'
import type { RebuttalSnapshot } from './research-rebuttal-snapshot'

export type RebuttalPdfBuild =
  | {
      status: 'ok'
      source: PdfDocumentSource
      pdfPath: string
      texPath: string
      pages: number | null
      missing: string[]
    }
  | { status: 'failed'; message: string; output: string }

/** The same LaTeX build Writing uses: Tectonic here, or on the Aster server that holds the project. */
async function compileTex(
  snapshot: RebuttalSnapshot,
  sourcePath: string
): Promise<ResearchLatexCompileResult> {
  const { owner } = snapshot
  const authority = parseHostAuthorityKey(owner.hostId)
  const remote =
    authority?.endpoint.kind === 'environment' && authority.at === 'local'
      ? runtimeRpcTargetForAuthorityKey(authorityKey(authority))
      : null
  if (remote) {
    return callRuntimeRpc<ResearchLatexCompileResult>(
      remote,
      'researchProject.latexCompile',
      { worktree: `id:${owner.workspaceId}`, sourcePath },
      { timeoutMs: 16 * 60_000 }
    )
  }
  if (owner.hostId !== 'local' || !window.api.researchLatex?.compile) {
    return {
      status: 'unsupported',
      message:
        'PDF builds are unavailable on this SSH route. Connect the project through an Aster server.',
      output: ''
    }
  }
  return window.api.researchLatex.compile({
    workspacePath: owner.workspacePath,
    sourcePath,
    buildId: createBrowserUuid()
  })
}

async function countPdfPages(bytes: Uint8Array): Promise<number | null> {
  try {
    // Why PdfViewer first: loading it points pdf.js at the worker bundle the app ships.
    await import('@/components/editor/PdfViewer')
    const pdfjs = await import('pdfjs-dist')
    const { buildPdfJsDocumentOptions } =
      await import('@/components/editor/pdf-js-document-options')
    // Why a copy: pdf.js transfers the buffer, and the viewer shows these same bytes.
    const task = pdfjs.getDocument(buildPdfJsDocumentOptions(bytes.slice(), document.baseURI))
    try {
      return (await task.promise).numPages
    } finally {
      void task.destroy().catch(() => undefined)
    }
  } catch {
    return null
  }
}

/** Writes `responses/rebuttal.tex` from the current drafts, compiles it, and reads the PDF back. */
export async function buildRebuttalPdf(snapshot: RebuttalSnapshot): Promise<RebuttalPdfBuild> {
  const { text, missing } = assembleRebuttalLatex(snapshot.bundle)
  const texPath = await writeRebuttalOutput(snapshot, 'rebuttal.tex', text)
  const result = await compileTex(snapshot, texPath)
  if (result.status !== 'ok') {
    return { status: 'failed', message: result.message, output: result.output }
  }
  const file = resolveManuscriptFile(snapshot.owner, result.pdfPath, '.pdf')
  const pdf = await readManuscriptPdf(snapshot.owner, file)
  return {
    status: 'ok',
    source: {
      key: JSON.stringify([file.absolutePath, pdf.size, pdf.mtime]),
      size: pdf.size,
      bytes: pdf.bytes,
      ranged: null
    },
    pdfPath: file.relativePath,
    texPath,
    pages: await countPdfPages(pdf.bytes),
    missing
  }
}
