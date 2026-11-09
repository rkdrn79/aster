import { Suspense, lazy, useState } from 'react'
import { FileText, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { buildRebuttalPdf, type RebuttalPdfBuild } from './research-rebuttal-pdf'
import type { RebuttalSnapshot } from './research-rebuttal-snapshot'

const PdfViewer = lazy(() => import('@/components/editor/PdfViewer'))

/** The CVPR/ICCV-style one-page rebuttal, built from the drafts with the Writing LaTeX build. */
export function ResearchRebuttalPdfPanel({
  snapshot,
  readOnly
}: {
  snapshot: RebuttalSnapshot
  readOnly: boolean
}): React.JSX.Element {
  const [building, setBuilding] = useState(false)
  const [build, setBuild] = useState<RebuttalPdfBuild | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pageLimit = snapshot.bundle.meta.limits.pdfPages

  async function run(): Promise<void> {
    setBuilding(true)
    setError(null)
    try {
      setBuild(await buildRebuttalPdf(snapshot))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBuilding(false)
    }
  }

  const pages = build?.status === 'ok' ? build.pages : null
  return (
    <section aria-label="One-page PDF" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={building || readOnly} onClick={() => void run()}>
          {building ? <Loader2 className="animate-spin" aria-hidden /> : <FileText aria-hidden />}
          {building ? 'Building PDF…' : build ? 'Rebuild PDF' : 'Build PDF'}
        </Button>
        {build?.status === 'ok' ? (
          <span
            className={cn(
              'text-xs tabular-nums',
              pages !== null && pages > pageLimit
                ? 'font-medium text-destructive'
                : 'text-muted-foreground'
            )}
          >
            {pages === null ? 'Built' : `${pages} ${pages === 1 ? 'page' : 'pages'}`} · limit{' '}
            {pageLimit} · {build.texPath}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">
            Writes {snapshot.directory}/responses/rebuttal.tex from the drafts and compiles it.
          </span>
        )}
      </div>
      {build?.status === 'ok' && build.missing.length ? (
        <p className="text-xs text-status-warning">
          No draft yet for {build.missing.join(', ')}; the PDF marks them.
        </p>
      ) : null}
      {build?.status === 'ok' && pages !== null && pages > pageLimit ? (
        <p className="text-xs text-destructive">
          The rebuttal runs to {pages} pages; the venue allows {pageLimit}. Shorten the answers.
        </p>
      ) : null}
      {error || build?.status === 'failed' ? (
        <div role="alert" className="space-y-1.5">
          <p className="text-xs text-destructive">
            {error ?? (build?.status === 'failed' ? build.message : '')}
          </p>
          {build?.status === 'failed' && build.output ? (
            <pre className="scrollbar-sleek max-h-48 overflow-auto rounded-md bg-muted px-2.5 py-2 font-mono text-2xs leading-4 whitespace-pre-wrap">
              {build.output.split('\n').slice(-40).join('\n')}
            </pre>
          ) : null}
        </div>
      ) : null}
      {build?.status === 'ok' ? (
        <div className="h-[min(70vh,56rem)] overflow-hidden rounded-lg border border-border">
          <Suspense
            fallback={
              <p role="status" className="p-4 text-sm text-muted-foreground">
                Loading PDF…
              </p>
            }
          >
            <PdfViewer
              content={build.base64}
              filePath={build.pdfPath}
              preferenceKey={`${snapshot.owner.workspaceId}:${build.pdfPath}`}
            />
          </Suspense>
        </div>
      ) : null}
    </section>
  )
}
