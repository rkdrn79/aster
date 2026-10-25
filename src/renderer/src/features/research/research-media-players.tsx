import { useCallback, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { PanZoomImageDialog } from '@/components/editor/PanZoomImageDialog'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { ResearchMediaKind } from '../../../../shared/research/research-run-media'
import { joinMediaSyncGroup } from './research-media-sync'
import {
  useNearViewport,
  useResearchMediaUrl,
  type ResearchMediaSource
} from './research-media-url'

/** One file a media view shows, described without its path unless `hint` carries it. */
export type ResearchMediaEntry = {
  key: string
  source: ResearchMediaSource
  kind: ResearchMediaKind
  /** Project-relative paths to try in order; empty when the file is outside the project. */
  paths: readonly string[]
  caption: string
  /** Alt text and the player's accessible name. */
  description: string
  /** Hover text such as the file path; left out where Run names must stay hidden. */
  hint?: string
  /** Players that share a key keep play, pause, seeking and speed together. */
  syncKey?: string
}

/** `grid`: square thumbnails; `stack`: each file at the width of its column. */
export type ResearchMediaLayout = 'grid' | 'stack'

function MediaProblem({ text }: { text: string }): React.JSX.Element {
  return (
    <p className="flex min-h-16 items-center justify-center rounded-md border border-dashed border-border p-2 text-center text-xs text-muted-foreground">
      {text}
    </p>
  )
}

function Caption({ entry }: { entry: ResearchMediaEntry }): React.JSX.Element {
  return (
    <figcaption className="truncate text-xs text-muted-foreground" title={entry.hint}>
      {entry.caption}
    </figcaption>
  )
}

function ImageTile({
  entry,
  layout,
  onOpen
}: {
  entry: ResearchMediaEntry
  layout: ResearchMediaLayout
  onOpen: () => void
}): React.JSX.Element {
  const [ref, near] = useNearViewport()
  const { url, error } = useResearchMediaUrl(entry.source, entry.paths, near)
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const problem = error ?? (url && failedUrl === url ? 'This image could not be shown.' : null)
  return (
    <figure ref={ref} className="min-w-0 space-y-1">
      {problem ? (
        <MediaProblem text={problem} />
      ) : (
        <button
          type="button"
          onClick={onOpen}
          disabled={!url}
          aria-label={`Enlarge ${entry.description}`}
          className={cn(
            'block w-full cursor-zoom-in overflow-hidden rounded-md border border-border bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default',
            layout === 'grid' ? 'aspect-square' : 'min-h-24'
          )}
        >
          {url ? (
            <img
              src={url}
              alt={entry.description}
              draggable={false}
              onError={() => setFailedUrl(url)}
              className={cn(
                'object-contain',
                layout === 'grid' ? 'size-full' : 'mx-auto max-h-80 w-full'
              )}
            />
          ) : null}
        </button>
      )}
      <Caption entry={entry} />
    </figure>
  )
}

function PlayerTile({ entry }: { entry: ResearchMediaEntry }): React.JSX.Element {
  const [ref, near] = useNearViewport()
  const { url, error } = useResearchMediaUrl(entry.source, entry.paths, near)
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const { syncKey } = entry
  // Why src is set here, not as a prop: unmounting must drop it to end the stream, and a
  // Strict Mode replay re-attaches the same element.
  const attach = useCallback(
    (media: HTMLMediaElement | null) => {
      if (!media || !url) {
        return
      }
      media.src = url
      const leave = syncKey ? joinMediaSyncGroup(syncKey, media) : null
      return () => {
        leave?.()
        media.pause()
        media.removeAttribute('src')
        media.load()
      }
    },
    [syncKey, url]
  )
  const problem =
    error ??
    (url && failedUrl === url ? 'This file could not be played (missing or unsupported).' : null)
  const playerProps = {
    ref: attach,
    controls: true,
    preload: 'metadata',
    'aria-label': entry.description,
    onError: () => setFailedUrl(url)
  } as const
  return (
    <figure ref={ref} className="min-w-0 space-y-1">
      {problem ? (
        <MediaProblem text={problem} />
      ) : !url ? (
        <div
          className={cn(
            'rounded-md border border-border bg-muted',
            entry.kind === 'video' ? 'aspect-video' : 'h-10'
          )}
        />
      ) : entry.kind === 'video' ? (
        <video {...playerProps} className="max-h-80 w-full rounded-md bg-muted" />
      ) : (
        <audio {...playerProps} className="w-full" />
      )}
      <Caption entry={entry} />
    </figure>
  )
}

/** An image thumbnail (opened with `onOpenImage`) or a video or audio player. */
export function ResearchMediaTile({
  entry,
  layout,
  onOpenImage
}: {
  entry: ResearchMediaEntry
  layout: ResearchMediaLayout
  onOpenImage: () => void
}): React.JSX.Element {
  return entry.kind === 'image' ? (
    <ImageTile entry={entry} layout={layout} onOpen={onOpenImage} />
  ) : (
    <PlayerTile entry={entry} />
  )
}

function LightboxButton({
  label,
  disabled,
  onClick,
  children
}: {
  label: string
  disabled: boolean
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

type LightboxProps = {
  images: readonly ResearchMediaEntry[]
  index: number
  onIndexChange: (index: number) => void
  onClose: () => void
}

function Lightbox({
  entry,
  images,
  index,
  onIndexChange,
  onClose
}: LightboxProps & { entry: ResearchMediaEntry }): React.JSX.Element {
  const { url, error } = useResearchMediaUrl(entry.source, entry.paths, true)
  const go = (delta: number): void => {
    const next = index + delta
    if (next >= 0 && next < images.length) {
      onIndexChange(next)
    }
  }
  return (
    <PanZoomImageDialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose()
        }
      }}
      src={url}
      title={`${entry.description} (${index + 1} of ${images.length})`}
      showTitle
      fallback={<p className="text-sm text-muted-foreground">{error ?? 'Loading…'}</p>}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault()
          go(event.key === 'ArrowLeft' ? -1 : 1)
        }
      }}
      toolbarActions={
        images.length > 1 ? (
          <>
            <LightboxButton label="Previous image" disabled={index === 0} onClick={() => go(-1)}>
              <ChevronLeft />
            </LightboxButton>
            <LightboxButton
              label="Next image"
              disabled={index === images.length - 1}
              onClick={() => go(1)}
            >
              <ChevronRight />
            </LightboxButton>
          </>
        ) : null
      }
    />
  )
}

/** Full-window images with ← and → between them; Escape closes. */
export function ResearchMediaLightbox(props: LightboxProps): React.JSX.Element | null {
  const entry = props.images[props.index]
  return entry ? <Lightbox entry={entry} {...props} /> : null
}

/** Images as thumbnails that open a lightbox, then the videos and audio as players. */
export function ResearchMediaGallery({
  entries,
  layout
}: {
  entries: readonly ResearchMediaEntry[]
  layout: ResearchMediaLayout
}): React.JSX.Element {
  const images = entries.filter((entry) => entry.kind === 'image')
  const players = entries.filter((entry) => entry.kind !== 'image')
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  return (
    <div className="space-y-3">
      {images.length ? (
        <div
          className={cn(
            'grid gap-2',
            layout === 'grid' ? 'grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))]' : 'grid-cols-1'
          )}
        >
          {images.map((entry, index) => (
            <ImageTile
              key={entry.key}
              entry={entry}
              layout={layout}
              onOpen={() => setOpenIndex(index)}
            />
          ))}
        </div>
      ) : null}
      {players.length ? (
        <div
          className={cn(
            'grid gap-3',
            layout === 'grid' ? 'grid-cols-[repeat(auto-fill,minmax(16rem,1fr))]' : 'grid-cols-1'
          )}
        >
          {players.map((entry) => (
            <PlayerTile key={entry.key} entry={entry} />
          ))}
        </div>
      ) : null}
      {openIndex !== null ? (
        <ResearchMediaLightbox
          images={images}
          index={Math.min(openIndex, images.length - 1)}
          onIndexChange={setOpenIndex}
          onClose={() => setOpenIndex(null)}
        />
      ) : null}
    </div>
  )
}
