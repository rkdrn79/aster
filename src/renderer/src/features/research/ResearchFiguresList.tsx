import { useEffect, useMemo, useState } from 'react'
import { FileText, PanelLeftClose, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  figurePaperState,
  paperCopyPath,
  type FigureListing,
  type FigurePublication,
  type ListedFigure
} from '../../../../research-harness/research-figures-locations.mjs'
import { figureFilePaths } from '../../../../research-harness/research-figures-model.mjs'
import { ResearchFigureDeleteDialog, ResearchFigureRenameDialog } from './ResearchFigureListDialogs'
import { FigureThumbnailImage, ResearchFigureListItem } from './ResearchFigureListItem'
import { useFigureListMeta, useManuscriptText } from './research-figure-list-meta'
import {
  FIGURE_SEARCH_FROM,
  figureExportState,
  filterFigures,
  type FigureSort
} from './research-figure-list-model'
import { figureUsageLines } from './research-figure-paper-block'
import { setFiguresListMode } from './research-figures-layout-mode'
import type { FigureSelection } from './research-figures-store'
import { readProjectFile, type ProjectFileOwner } from './research-project-files'
import { useFigureListActions } from './use-figure-list-actions'

const thumbnails = new Map<string, string | null>()

async function fileThumbnailUrl(owner: ProjectFileOwner, path: string): Promise<string | null> {
  const file = await readProjectFile(owner, path)
  if (!file.isBinary) {
    return path.endsWith('.svg')
      ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(file.content)}`
      : null
  }
  return file.mimeType?.startsWith('image/') ? `data:${file.mimeType};base64,${file.content}` : null
}

/** A read-only image's preview; cached per file version. */
function FileThumbnail({
  owner,
  path,
  signature
}: {
  owner: ProjectFileOwner
  path: string | null
  signature: string
}): React.JSX.Element {
  const key = path ? `${path}|${signature}` : ''
  const [loaded, setLoaded] = useState<{ key: string; url: string | null } | null>(null)
  useEffect(() => {
    if (!path || thumbnails.has(key)) {
      return
    }
    let live = true
    void fileThumbnailUrl(owner, path)
      .catch(() => null)
      .then((url) => {
        thumbnails.set(key, url)
        if (live) {
          setLoaded({ key, url })
        }
      })
    return () => {
      live = false
    }
  }, [owner, path, key])
  const url = thumbnails.get(key) ?? (loaded?.key === key ? loaded.url : null)
  return <FigureThumbnailImage url={url} className="h-16 w-full" />
}

type Props = {
  owner: ProjectFileOwner
  folder: string | null
  manuscript: string | null
  manuscriptSignature: string
  listing: FigureListing
  signatures: Record<string, string>
  publications: Record<string, FigurePublication>
  selected: FigureSelection | null
  onSelect: (selection: FigureSelection) => void
  onNew: () => void
}

function mtime(signature: string | undefined): number {
  return Number(signature?.split(':')[1]) || 0
}

type Actions = ReturnType<typeof useFigureListActions>

/** One figure, filtered by title once its scene is read (the title lives in the scene). */
function FigureEntry({
  props,
  figure,
  manuscriptText,
  query,
  actions
}: {
  props: Props
  figure: ListedFigure
  manuscriptText: string | null
  query: string
  actions: Actions
}): React.JSX.Element | null {
  const { owner, signatures, selected, manuscript, publications } = props
  const { slug } = figure
  const files = figureFilePaths(figure.folder, slug)
  const signature = signatures[files.scene] ?? ''
  const meta = useFigureListMeta(owner, figure.folder, slug, signature)
  const usages = manuscriptText ? figureUsageLines(manuscriptText, slug) : []
  const expectedPdf = manuscript ? paperCopyPath(manuscript, slug) : ''
  const record = publications[slug] ?? null
  const paperState = figurePaperState({
    location: figure.location,
    record,
    paperCopy: Boolean(signatures[expectedPdf]),
    expectedPdf,
    sceneSha256: meta?.sceneSha256 ?? null
  })
  const target = {
    slug,
    title: meta?.title ?? null,
    usages,
    folder: figure.folder,
    paperCopy: figure.location === 'work' && record ? expectedPdf : null
  }
  const needle = query.trim().toLowerCase()
  if (needle && !slug.includes(needle) && !(meta?.title?.toLowerCase().includes(needle) ?? false)) {
    return null
  }
  return (
    <ResearchFigureListItem
      owner={owner}
      folder={figure.folder}
      slug={slug}
      meta={meta}
      active={selected?.kind === 'figure' && selected.slug === slug}
      usages={usages}
      exportState={figureExportState(signature, signatures[files.pdf])}
      paperState={paperState}
      updatingPaper={actions.updating === slug}
      onSelect={() => props.onSelect({ kind: 'figure', slug })}
      onAction={(action) => actions.run(action, target)}
      onUpdatePaper={() => actions.updateInPaper(target)}
    />
  )
}

/** Every figure of the project, with its menus and badges, and search once there are many. */
export function ResearchFiguresList(props: Props): React.JSX.Element {
  const { owner, folder, manuscript, listing, signatures, selected, onSelect } = props
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<FigureSort>('recent')
  const text = useManuscriptText(owner, manuscript, props.manuscriptSignature)
  const taken = useMemo(() => new Set(listing.figures.map((figure) => figure.slug)), [listing])
  const actions = useFigureListActions({ owner, folder, manuscript, taken })
  const searchable = listing.figures.length >= FIGURE_SEARCH_FROM
  const entries = listing.figures.map((figure) => ({
    figure,
    slug: figure.slug,
    title: null,
    modified: mtime(signatures[figureFilePaths(figure.folder, figure.slug).scene])
  }))
  const shown = searchable ? filterFigures(entries, '', sort) : entries
  return (
    <nav aria-label="Figures" className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-1 p-2 pb-1">
        <Button
          size="sm"
          variant="outline"
          className="min-w-0 flex-1 justify-start"
          aria-label="New figure"
          onClick={props.onNew}
        >
          <Plus aria-hidden /> New figure
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Collapse figure list"
          title="Collapse to thumbnails"
          onClick={() => setFiguresListMode('strip')}
        >
          <PanelLeftClose aria-hidden />
        </Button>
      </div>
      {searchable ? (
        <div className="flex shrink-0 items-center gap-1 px-2 pb-1">
          <Input
            aria-label="Search figures"
            placeholder="Search figures"
            value={query}
            className="h-7 min-w-0 flex-1"
            onChange={(event) => setQuery(event.target.value)}
          />
          <select
            aria-label="Sort figures"
            value={sort}
            className="h-7 rounded-md border border-border bg-background px-1 text-xs"
            onChange={(event) => setSort(event.target.value === 'name' ? 'name' : 'recent')}
          >
            <option value="recent">Recent</option>
            <option value="name">Name</option>
          </select>
        </div>
      ) : null}
      <div className="scrollbar-sleek flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2 pt-1">
        {shown.map((entry) => (
          <FigureEntry
            key={entry.slug}
            props={props}
            figure={entry.figure}
            query={query}
            manuscriptText={text}
            actions={actions}
          />
        ))}
        {listing.others.length ? (
          <p className="mt-2 px-1.5 text-2xs font-medium tracking-wide text-muted-foreground uppercase">
            Other figures · read-only
          </p>
        ) : null}
        {listing.others.map((entry) => {
          const active = selected?.kind === 'file' && selected.name === entry.name
          return (
            <button
              key={entry.name}
              type="button"
              aria-current={active ? 'true' : undefined}
              aria-label={`Open ${entry.name}`}
              className={cn(
                'flex flex-col gap-1 rounded-md p-1.5 text-left text-xs hover:bg-accent',
                active && 'bg-accent'
              )}
              onClick={() => onSelect({ kind: 'file', name: entry.name })}
            >
              {entry.kind === 'pdf' ? (
                <span className="flex h-16 w-full items-center justify-center rounded-sm border border-border">
                  <FileText className="size-5 text-muted-foreground" aria-hidden />
                </span>
              ) : (
                <FileThumbnail
                  owner={owner}
                  path={`${entry.folder}/${entry.name}`}
                  signature={signatures[`${entry.folder}/${entry.name}`] ?? ''}
                />
              )}
              <span className="truncate">{entry.name}</span>
            </button>
          )
        })}
        {listing.shadowed.map((entry) => (
          <p key={entry.slug} className="px-1.5 py-1 text-2xs text-muted-foreground">
            {entry.folder}/{entry.slug}.excalidraw is left as it is:{' '}
            {folder ?? 'the figures folder'} has a figure with the same name.
          </p>
        ))}
        {!listing.figures.length && !listing.others.length ? (
          <p className="px-1.5 py-2 text-xs text-muted-foreground">
            No figures in {folder ?? 'the figures folder'} yet.
          </p>
        ) : null}
      </div>
      {actions.rename ? (
        <ResearchFigureRenameDialog
          request={actions.rename}
          taken={taken}
          onClose={actions.closeRename}
          onRename={actions.submitRename}
        />
      ) : null}
      {actions.confirmDelete ? (
        <ResearchFigureDeleteDialog
          title={actions.confirmDelete.title ?? actions.confirmDelete.slug}
          usages={actions.confirmDelete.usages}
          manuscript={manuscript}
          paperCopy={actions.confirmDelete.paperCopy}
          onClose={actions.closeDelete}
          onDelete={actions.deleteConfirmed}
        />
      ) : null}
    </nav>
  )
}
