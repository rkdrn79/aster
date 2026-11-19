import { ChartLine, FileText, PanelLeftOpen, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type {
  FigureListing,
  ListedPlot
} from '../../../../research-harness/research-figures-locations.mjs'
import { figureFilePaths } from '../../../../research-harness/research-figures-model.mjs'
import { FigureThumbnailImage } from './ResearchFigureListItem'
import { useFigureListMeta } from './research-figure-list-meta'
import { plotRunHint, usePlotState } from './research-plot-files'
import { setFiguresListMode } from './research-figures-layout-mode'
import type { FigureSelection } from './research-figures-store'
import type { ProjectFileOwner } from './research-project-files'

function StripFigure({
  owner,
  folder,
  slug,
  signature,
  active,
  onSelect
}: {
  owner: ProjectFileOwner
  folder: string | null
  slug: string
  signature: string
  active: boolean
  onSelect: () => void
}): React.JSX.Element {
  const meta = useFigureListMeta(owner, folder, slug, signature)
  const title = meta?.title ?? slug
  return (
    <button
      type="button"
      aria-label={`Open figure ${title}`}
      aria-current={active ? 'true' : undefined}
      title={title}
      className={cn(
        'rounded-lg p-1 transition-colors duration-(--duration-fast) hover:bg-accent',
        active && 'bg-accent'
      )}
      onClick={onSelect}
    >
      <FigureThumbnailImage
        url={meta?.thumbnail}
        className={cn('size-10', active && 'border-foreground/30 shadow-raised')}
      />
    </button>
  )
}

function StripPlot({
  owner,
  plot,
  signatures,
  active,
  onSelect
}: {
  owner: ProjectFileOwner
  plot: ListedPlot
  signatures: Record<string, string>
  active: boolean
  onSelect: () => void
}): React.JSX.Element {
  const state = usePlotState(owner, plot, signatures)
  const hint = state ? plotRunHint(state.run) : null
  const title = hint ? `${plot.slug} · plot · ${hint.toLowerCase()}` : `${plot.slug} · plot`
  return (
    <button
      type="button"
      aria-label={`Open plot ${plot.slug}`}
      aria-current={active ? 'true' : undefined}
      title={title}
      className={cn(
        'rounded-lg p-1 transition-colors duration-(--duration-fast) hover:bg-accent',
        active && 'bg-accent'
      )}
      onClick={onSelect}
    >
      <FigureThumbnailImage
        url={state?.png}
        icon={ChartLine}
        className={cn('size-10', active && 'border-foreground/30 shadow-raised')}
      />
    </button>
  )
}

/** The figure list folded to a 56 px column of thumbnails (narrow windows and focus mode). */
export function ResearchFiguresStrip({
  owner,
  listing,
  signatures,
  selected,
  onSelect,
  onNew
}: {
  owner: ProjectFileOwner
  listing: FigureListing
  signatures: Record<string, string>
  selected: FigureSelection | null
  onSelect: (selection: FigureSelection) => void
  onNew: () => void
}): React.JSX.Element {
  return (
    <nav aria-label="Figures" className="flex min-h-0 flex-1 flex-col items-center gap-1 py-2">
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="Expand figure list"
        title="Show the figure list"
        onClick={() => setFiguresListMode('full')}
      >
        <PanelLeftOpen aria-hidden />
      </Button>
      <Button
        size="icon-sm"
        variant="outline"
        aria-label="New figure"
        title="New figure"
        onClick={onNew}
      >
        <Plus aria-hidden />
      </Button>
      <div className="scrollbar-sleek flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto pt-1">
        {listing.figures.map((figure) => (
          <StripFigure
            key={figure.slug}
            owner={owner}
            folder={figure.folder}
            slug={figure.slug}
            signature={signatures[figureFilePaths(figure.folder, figure.slug).scene] ?? ''}
            active={selected?.kind === 'figure' && selected.slug === figure.slug}
            onSelect={() => onSelect({ kind: 'figure', slug: figure.slug })}
          />
        ))}
        {listing.plots.map((plot) => (
          <StripPlot
            key={plot.slug}
            owner={owner}
            plot={plot}
            signatures={signatures}
            active={selected?.kind === 'plot' && selected.slug === plot.slug}
            onSelect={() => onSelect({ kind: 'plot', slug: plot.slug })}
          />
        ))}
        {listing.others.map((entry) => (
          <button
            key={entry.name}
            type="button"
            aria-label={`Open ${entry.name}`}
            title={entry.name}
            aria-current={
              selected?.kind === 'file' && selected.name === entry.name ? 'true' : undefined
            }
            className={cn(
              'flex size-11 items-center justify-center rounded-lg hover:bg-accent',
              selected?.kind === 'file' && selected.name === entry.name && 'bg-accent'
            )}
            onClick={() => onSelect({ kind: 'file', name: entry.name })}
          >
            <FileText className="size-4 text-muted-foreground" aria-hidden />
          </button>
        ))}
      </div>
    </nav>
  )
}
