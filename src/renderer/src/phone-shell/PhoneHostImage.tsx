import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ImageOff, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { readHostImage } from '@/web/web-research-images'
import { PhoneZoomableImage } from './PhoneZoomableImage'

type HostImageRead =
  | { status: 'loading' }
  | { status: 'ready'; src: string }
  | { status: 'error'; message: string }

/** A workspace image read through the host; `version` re-reads it when the file changed. */
export function useHostImage(
  worktreeId: string,
  relativePath: string | null,
  version?: string
): HostImageRead {
  const [read, setRead] = useState<{ key: string; value: HostImageRead } | null>(null)
  const key = `${worktreeId}\0${relativePath ?? ''}\0${version ?? ''}`
  useEffect(() => {
    if (!relativePath) {
      return
    }
    let active = true
    readHostImage(worktreeId, relativePath, { fresh: version !== undefined }).then(
      (src) => active && setRead({ key, value: { status: 'ready', src } }),
      (error: unknown) =>
        active &&
        setRead({
          key,
          value: {
            status: 'error',
            message: error instanceof Error ? error.message : String(error)
          }
        })
    )
    return () => {
      active = false
    }
  }, [worktreeId, relativePath, version, key])
  return read?.key === key ? read.value : { status: 'loading' }
}

/** A thumbnail of a workspace image on the figure's white paper, or why it could not be shown. */
export function PhoneHostThumbnail({
  worktreeId,
  path,
  alt,
  version,
  className
}: {
  worktreeId: string
  path: string
  alt: string
  version?: string
  className?: string
}): React.JSX.Element {
  const read = useHostImage(worktreeId, path, version)
  return (
    <span
      className={cn(
        'flex items-center justify-center overflow-hidden rounded-lg border border-border bg-white',
        className
      )}
    >
      {read.status === 'ready' ? (
        <img src={read.src} alt={alt} className="max-h-full max-w-full object-contain" />
      ) : read.status === 'error' ? (
        <ImageOff className="size-5 text-muted-foreground" aria-label={read.message} />
      ) : (
        <span className="size-full animate-pulse bg-muted" aria-hidden />
      )}
    </span>
  )
}

/** A full-screen, pinch-zoomable look at one workspace image; tap ✕ to close. */
export function PhoneImageOverlay({
  worktreeId,
  path,
  title,
  onClose
}: {
  worktreeId: string
  path: string
  title: string
  onClose: () => void
}): React.JSX.Element {
  const read = useHostImage(worktreeId, path)
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex flex-col bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
    >
      <div className="flex h-12 shrink-0 items-center gap-2 px-2">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex size-11 items-center justify-center rounded-md active:bg-accent"
        >
          <X className="size-5" aria-hidden />
        </button>
        <p className="min-w-0 flex-1 truncate text-[15px] font-medium">{title}</p>
      </div>
      <div className="flex min-h-0 flex-1 bg-white">
        {read.status === 'ready' ? (
          <PhoneZoomableImage src={read.src} alt={title} />
        ) : (
          <p className="m-auto px-8 text-center text-[13px] text-muted-foreground">
            {read.status === 'error' ? read.message : 'Loading…'}
          </p>
        )}
      </div>
    </div>,
    document.body
  )
}
