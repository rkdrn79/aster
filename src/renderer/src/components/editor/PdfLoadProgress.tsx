import { translate } from '@/i18n/i18n'
import type { RangedFileProgress } from './ranged-file'

function megabytes(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)
}

export function pdfLoadProgressLabel(progress: RangedFileProgress): string {
  return `${megabytes(progress.loaded)} / ${megabytes(progress.total)} MB`
}

/** Shown over the pane until the first page paints, so a slow host reads as progress, not a blank. */
export function PdfLoadProgressOverlay({
  progress
}: {
  progress: RangedFileProgress
}): React.JSX.Element {
  const percent = progress.total > 0 ? Math.round((progress.loaded / progress.total) * 100) : 0
  return (
    <div
      role="status"
      className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center gap-2 p-6 text-xs text-muted-foreground"
    >
      <span className="tabular-nums">
        {translate(
          'auto.components.editor.PdfLoadProgress.da4143bbfa',
          'Loading PDF · {{value0}}',
          {
            value0: pdfLoadProgressLabel(progress)
          }
        )}
      </span>
      <span className="h-1 w-40 overflow-hidden rounded-full bg-muted">
        <span className="block h-full bg-foreground/40" style={{ width: `${percent}%` }} />
      </span>
    </div>
  )
}
