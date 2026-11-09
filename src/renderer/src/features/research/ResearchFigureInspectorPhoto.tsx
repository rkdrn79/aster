import { useRef, useState } from 'react'
import { newElementWith } from '@excalidraw/excalidraw'
import { ChevronDown, Crop, FolderOpen, ImageUp } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import type { InspectorContext } from './research-figure-inspector-registry'
import {
  imageMimeType,
  isPhoto,
  noisePhoto,
  readImageFile,
  replacePhoto
} from './research-figure-photo'
import { readProjectFile } from './research-project-files'
import { useResearchFigures } from './research-figures-store'
import { InspectorAction, InspectorChip, InspectorHeading } from './ResearchFigureInspectorParts'

const NOISE_LEVELS = [0, 0.25, 0.5, 0.75] as const

/** Sends a key to Excalidraw's own container, so its action (cropping) runs with undo. */
function sendKey(key: string): void {
  document
    .querySelector('[data-research-figure-canvas] .excalidraw-container')
    ?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
}

/** Replace a photo's picture (keeping its frame), crop it, take one from the project, add noise. */
export function InspectorPhotoSection({
  context
}: {
  context: InspectorContext
}): React.JSX.Element | null {
  const input = useRef<HTMLInputElement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const photo = context.selected.find(isPhoto)
  if (!photo) {
    return null
  }
  const level = typeof photo.customData?.asterNoise === 'number' ? photo.customData.asterNoise : 0
  const run = (work: Promise<void>): void => {
    setError(null)
    work.catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
  }
  const fromProject = (name: string): void => {
    const api = context.api()
    if (!api) {
      return
    }
    run(
      readProjectFile(context.project.owner, `${context.project.folder}/${name}`).then(
        async (file) => {
          const mimeType = imageMimeType(file.mimeType ?? '')
          if (!file.isBinary || !mimeType) {
            throw new Error(`${name} is not a picture Aster can place.`)
          }
          await replacePhoto(
            api,
            photo.id,
            { dataURL: `data:${mimeType};base64,${file.content}`, mimeType },
            context.commit
          )
        }
      )
    )
  }
  const pictures = useResearchFigures
    .getState()
    .listing.others.filter((entry) => entry.kind === 'image')
  return (
    <div>
      <InspectorHeading>Photo</InspectorHeading>
      <div className="flex flex-wrap gap-0.5 px-2">
        <InspectorAction label="Replace the picture…" onClick={() => input.current?.click()}>
          <ImageUp aria-hidden /> Replace…
        </InspectorAction>
        <InspectorAction label="Crop" onClick={() => sendKey('Enter')}>
          <Crop aria-hidden /> Crop
        </InspectorAction>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Pick a picture from the project"
              className="flex h-6 items-center gap-1 rounded-md px-1.5 text-xs hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring [&_svg]:size-3.5"
            >
              <FolderOpen aria-hidden /> Project <ChevronDown aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-48">
            <DropdownMenuLabel>Pictures beside the figures</DropdownMenuLabel>
            {pictures.length ? (
              pictures.map((entry) => (
                <DropdownMenuItem key={entry.name} onSelect={() => fromProject(entry.name)}>
                  {entry.name}
                </DropdownMenuItem>
              ))
            ) : (
              <DropdownMenuItem disabled>No pictures in {context.project.folder}</DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        className="hidden"
        aria-label="Picture file"
        onChange={(event) => {
          const file = event.target.files?.[0]
          const api = context.api()
          event.target.value = ''
          if (file && api) {
            run(
              readImageFile(file).then((source) => {
                if (!source) {
                  throw new Error('That file is not a picture Aster can place.')
                }
                return replacePhoto(api, photo.id, source, context.commit)
              })
            )
          }
        }}
      />
      <div className="flex items-center gap-1 px-3 pt-1.5" role="group" aria-label="Noise">
        <span className="mr-1 text-xs text-muted-foreground">Noise</span>
        {NOISE_LEVELS.map((entry) => (
          <InspectorChip
            key={entry}
            pressed={Math.abs(level - entry) < 0.01}
            label={`${entry * 100}%`}
            title={`Noise ${entry * 100}%`}
            onClick={() => {
              const api = context.api()
              if (api) {
                run(noisePhoto(api, photo.id, entry, context.commit))
              }
            }}
          />
        ))}
      </div>
      {error ? (
        <p role="alert" className="px-3 pt-1 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}

const LINE_STYLES = ['solid', 'dashed', 'dotted'] as const

/** Line style, and colours outside the paper palette behind Custom…. */
export function InspectorStyleSection({
  context
}: {
  context: InspectorContext
}): React.JSX.Element {
  const [custom, setCustom] = useState(false)
  const strokes = new Set(context.selected.map((element) => element.strokeStyle))
  const current = strokes.size === 1 ? [...strokes][0] : null
  const first = context.selected[0]
  const paint = (
    update: Partial<{
      strokeStyle: (typeof LINE_STYLES)[number]
      strokeColor: string
      backgroundColor: string
      opacity: number
    }>
  ): void => {
    const api = context.api()
    if (!api) {
      return
    }
    const ids = new Set(context.selected.map((element) => element.id))
    context.commit(
      api
        .getSceneElementsIncludingDeleted()
        .map((element) => (ids.has(element.id) ? newElementWith(element, update) : element))
    )
  }
  return (
    <div className="pb-3">
      <InspectorHeading>Line</InspectorHeading>
      <div className="grid grid-cols-3 gap-1 px-3" role="group" aria-label="Line style">
        {LINE_STYLES.map((style) => (
          <InspectorChip
            key={style}
            pressed={current === style}
            label={style}
            title={`${style} line`}
            onClick={() => paint({ strokeStyle: style })}
          />
        ))}
      </div>
      <button
        type="button"
        aria-expanded={custom}
        className="mx-3 mt-2 flex items-center gap-1 rounded text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        onClick={() => setCustom(!custom)}
      >
        Custom… <ChevronDown className="size-3" aria-hidden />
      </button>
      {custom ? (
        <div className="space-y-1.5 px-3 pt-1.5 text-xs">
          {(['strokeColor', 'backgroundColor'] as const).map((field) => (
            <label key={field} className="flex items-center gap-2">
              <span className="w-14 text-muted-foreground">
                {field === 'strokeColor' ? 'Outline' : 'Fill'}
              </span>
              <input
                type="color"
                aria-label={field === 'strokeColor' ? 'Outline colour' : 'Fill colour'}
                value={/^#[0-9a-f]{6}$/i.test(first?.[field] ?? '') ? first?.[field] : '#ffffff'}
                className="h-6 w-10 cursor-pointer rounded border border-border bg-transparent"
                onChange={(event) => paint({ [field]: event.target.value })}
              />
              <span className="font-mono text-muted-foreground">{first?.[field]}</span>
            </label>
          ))}
          <label className="flex items-center gap-2">
            <span className="w-14 text-muted-foreground">Opacity</span>
            <input
              type="range"
              aria-label="Opacity"
              min={10}
              max={100}
              step={10}
              value={first?.opacity ?? 100}
              className="flex-1 accent-foreground"
              onChange={(event) => paint({ opacity: Number(event.target.value) })}
            />
          </label>
        </div>
      ) : null}
    </div>
  )
}
