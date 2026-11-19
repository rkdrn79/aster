import { useState } from 'react'
import { Film, Music } from 'lucide-react'
import type { ResearchRunMediaItem } from '../../../shared/research/research-run-media'
import { PhoneHostThumbnail, PhoneImageOverlay } from './PhoneHostImage'
import { PhoneRow, PhoneSectionNote } from './PhoneListLayout'

const IMAGES_SHOWN = 12

function itemName(item: ResearchRunMediaItem): string {
  return item.label || item.sampleId || item.path.split('/').at(-1) || item.path
}

function itemCaption(item: ResearchRunMediaItem): string {
  return [itemName(item), item.step !== null ? `step ${item.step}` : null]
    .filter(Boolean)
    .join(' · ')
}

function formatBytes(bytes: number | null): string | null {
  if (bytes === null) {
    return null
  }
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** Newest first: the latest step is what a person checks on a phone. */
export function newestMediaFirst(items: readonly ResearchRunMediaItem[]): ResearchRunMediaItem[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => (b.item.step ?? -1) - (a.item.step ?? -1) || b.index - a.index)
    .map(({ item }) => item)
}

/** A Run's images as thumbnails that open full screen, then its audio and video by name. */
export function PhoneRunMedia({
  worktreeId,
  items,
  truncated
}: {
  worktreeId: string
  items: readonly ResearchRunMediaItem[]
  truncated: boolean
}): React.JSX.Element {
  const [open, setOpen] = useState<ResearchRunMediaItem | null>(null)
  if (items.length === 0) {
    return <PhoneSectionNote>No images or samples recorded yet</PhoneSectionNote>
  }
  const ordered = newestMediaFirst(items)
  const images = ordered.filter((item) => item.kind === 'image')
  const others = ordered.filter((item) => item.kind !== 'image')
  const shown = images.slice(0, IMAGES_SHOWN)
  return (
    <>
      {shown.length ? (
        <div className="grid grid-cols-3 gap-2 p-3">
          {shown.map((item) => (
            <button
              key={`${item.path}/${item.step ?? ''}`}
              type="button"
              onClick={() => setOpen(item)}
              className="min-w-0 text-left active:opacity-70"
            >
              <PhoneHostThumbnail
                worktreeId={worktreeId}
                path={item.path}
                alt={itemCaption(item)}
                className="aspect-square w-full"
              />
              <span className="mt-1 block truncate text-xs text-muted-foreground">
                {itemCaption(item)}
              </span>
            </button>
          ))}
        </div>
      ) : null}
      {others.map((item) => (
        <PhoneRow
          key={`${item.path}/${item.step ?? ''}`}
          leading={
            item.kind === 'video' ? (
              <Film className="size-5" aria-hidden />
            ) : (
              <Music className="size-5" aria-hidden />
            )
          }
          title={itemName(item)}
          subtitle={[
            item.kind,
            item.step !== null ? `step ${item.step}` : null,
            formatBytes(item.bytes)
          ]
            .filter(Boolean)
            .join(' · ')}
        />
      ))}
      {images.length > shown.length || truncated ? (
        <PhoneSectionNote>
          {`The newest ${shown.length} of ${images.length}${truncated ? '+' : ''} images`}
        </PhoneSectionNote>
      ) : null}
      {open ? (
        <PhoneImageOverlay
          worktreeId={worktreeId}
          path={open.path}
          title={itemCaption(open)}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </>
  )
}
