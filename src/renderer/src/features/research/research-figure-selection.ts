// What the Figures page has selected (a diagram, a plot or a read-only file), kept pure so the
// store and its tests share it.
import type {
  FigureListing,
  ListedFigure,
  ListedPlot
} from '../../../../research-harness/research-figures-locations.mjs'

/** What the page shows: a diagram, a plot (a Python data figure), or a read-only image or PDF. */
export type FigureSelection =
  | { kind: 'figure'; slug: string }
  | { kind: 'plot'; slug: string }
  | { kind: 'file'; name: string }

/** A stored selection read back, or null when it is not one. */
export function parseFigureSelection(entry: unknown): FigureSelection | null {
  if (!entry || typeof entry !== 'object') {
    return null
  }
  const kind: unknown = Reflect.get(entry, 'kind')
  const value: unknown = Reflect.get(entry, kind === 'file' ? 'name' : 'slug')
  if (typeof value !== 'string') {
    return null
  }
  return kind === 'figure' || kind === 'plot'
    ? { kind, slug: value }
    : kind === 'file'
      ? { kind, name: value }
      : null
}

/** Whether what is selected is still in the list (a figure or plot renamed or deleted is not). */
export function stillListed(listing: FigureListing, selection: FigureSelection | null): boolean {
  if (!selection) {
    return false
  }
  switch (selection.kind) {
    case 'figure':
      return listing.figures.some((figure) => figure.slug === selection.slug)
    case 'plot':
      return listing.plots.some((plot) => plot.slug === selection.slug)
    case 'file':
      return listing.others.some((entry) => entry.name === selection.name)
  }
}

/** What the page opens on: the first diagram, else the first plot, else the first other file. */
export function firstSelection(listing: FigureListing): FigureSelection | null {
  return listing.figures[0]
    ? { kind: 'figure', slug: listing.figures[0].slug }
    : listing.plots[0]
      ? { kind: 'plot', slug: listing.plots[0].slug }
      : listing.others[0]
        ? { kind: 'file', name: listing.others[0].name }
        : null
}

/** The listed figure with this name: where it lives and what files it has. */
export function listedFigure(listing: FigureListing, slug: string): ListedFigure | null {
  return listing.figures.find((figure) => figure.slug === slug) ?? null
}

/** The listed plot with this name: its folder and which of its files exist. */
export function listedPlot(listing: FigureListing, slug: string): ListedPlot | null {
  return listing.plots.find((plot) => plot.slug === slug) ?? null
}
