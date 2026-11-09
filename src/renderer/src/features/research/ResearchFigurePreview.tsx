import { Suspense, lazy, useEffect, useState } from 'react'
import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { ListedFigureFile } from '../../../../research-harness/research-figures-locations.mjs'
import {
  FigurePublishConflict,
  publishFigureCopy,
  toastPublishConflict,
  toastPublished
} from './research-figure-publish'
import { readProjectFile, type ProjectFileOwner } from './research-project-files'

const PdfViewer = lazy(() => import('@/components/editor/PdfViewer'))

type Loaded = { key: string; base64: string | null; url: string | null; error: string | null }

/** A figure Aster did not draw (a matplotlib PDF, a PNG): shown as it is, with its LaTeX line. */
export function ResearchFigurePreview({
  owner,
  file,
  workFolder,
  manuscript,
  signature
}: {
  owner: ProjectFileOwner
  file: ListedFigureFile
  workFolder: string | null
  manuscript: string | null
  signature: string
}): React.JSX.Element {
  const { name } = file
  const path = `${file.folder}/${name}`
  const key = `${path}|${signature}`
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  useEffect(() => {
    let live = true
    void readProjectFile(owner, path).then(
      (file) => {
        if (!live) {
          return
        }
        const svg = !file.isBinary && name.toLowerCase().endsWith('.svg')
        setLoaded({
          key,
          base64: file.isBinary && name.toLowerCase().endsWith('.pdf') ? file.content : null,
          url: svg
            ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(file.content)}`
            : file.isBinary && file.mimeType?.startsWith('image/')
              ? `data:${file.mimeType};base64,${file.content}`
              : null,
          error: null
        })
      },
      (cause: unknown) => live && setLoaded({ key, base64: null, url: null, error: String(cause) })
    )
    return () => {
      live = false
    }
  }, [owner, path, name, key])
  const current = loaded?.key === key ? loaded : null
  const stem = name.replace(/\.[^.]+$/, '')
  const line = `\\includegraphics[width=\\columnwidth]{figures/${name}}`
  // Why only working PDFs: a file already beside the manuscript is what the paper reads.
  const canCopy = file.kind === 'pdf' && file.folder === workFolder && manuscript !== null
  const copyToPaper = async (replace = false): Promise<void> => {
    if (!manuscript) {
      return
    }
    try {
      const result = await publishFigureCopy({
        owner,
        slug: stem,
        from: path,
        manuscript,
        sceneSha256: null,
        replace
      })
      toastPublished(result, 'Copied to')
    } catch (cause) {
      if (cause instanceof FigurePublishConflict) {
        toastPublishConflict(cause, () => copyToPaper(true))
      } else {
        toast.error(`Not copied. ${cause instanceof Error ? cause.message : String(cause)}`)
      }
    }
  }

  return (
    <section aria-label={`Figure ${name}`} className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-1.5 text-xs">
        <span className="font-medium">{name}</span>
        <span className="text-muted-foreground">Read-only · made outside Figures</span>
        {canCopy ? (
          <Button
            size="xs"
            variant="outline"
            className="ml-auto"
            onClick={() => void copyToPaper()}
          >
            Copy to paper
          </Button>
        ) : null}
        <Button
          size="xs"
          variant="outline"
          className={canCopy ? undefined : 'ml-auto'}
          onClick={() =>
            void window.api.ui
              .writeClipboardText(line)
              .then(() => toast.success('LaTeX line copied.'))
          }
        >
          <Copy aria-hidden /> Copy \includegraphics
        </Button>
      </div>
      <div className="scrollbar-sleek min-h-0 flex-1 overflow-auto p-4" aria-label={stem}>
        {current?.error ? (
          <p role="alert" className="text-sm text-destructive">
            {current.error}
          </p>
        ) : current?.base64 ? (
          <div className="h-full min-h-96 overflow-hidden rounded-md border border-border">
            <Suspense fallback={<p className="p-4 text-sm text-muted-foreground">Loading PDF…</p>}>
              <PdfViewer content={current.base64} filePath={path} />
            </Suspense>
          </div>
        ) : current?.url ? (
          <img src={current.url} alt={name} className="mx-auto max-h-full max-w-full bg-white" />
        ) : (
          <p role="status" className="text-sm text-muted-foreground">
            {current ? 'No preview for this file.' : 'Loading…'}
          </p>
        )}
      </div>
    </section>
  )
}
