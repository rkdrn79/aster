import { useState, type ComponentType, type ReactNode } from 'react'
import {
  Check,
  Copy,
  FileCode2,
  FolderInput,
  FolderOpen,
  Loader2,
  MoreHorizontal,
  Pencil,
  Shapes,
  Trash2
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { getRevealInFileManagerLabel } from '@/lib/reveal-in-file-manager'
import { cn } from '@/lib/utils'
import { figureScriptExists } from './research-figure-file-actions'
import type { FigureListMeta } from './research-figure-list-meta'
import type { FigureExportState } from './research-figure-list-model'
import {
  FIGURE_MOVE_BLOCKED_LABEL,
  FIGURE_RENAME_BLOCKED_LABEL,
  useFigureRenameBlocked
} from './research-figure-rename-guard'
import type { FigurePaperState } from '../../../../research-harness/research-figures-locations.mjs'
import { useFigureAgentEditing } from './research-figure-turn'
import type { ProjectFileOwner } from './research-project-files'

export type FigureItemAction =
  | 'rename'
  | 'duplicate'
  | 'delete'
  | 'reveal'
  | 'include'
  | 'script'
  | 'adopt'

type MenuParts = {
  Item: ComponentType<{
    onSelect?: (event: Event) => void
    disabled?: boolean
    className?: string
    children: ReactNode
  }>
  Separator: ComponentType
}

function FigureMenuItems({
  Item,
  Separator,
  hasScript,
  renameBlocked,
  canAdopt,
  onAction
}: MenuParts & {
  hasScript: boolean | null
  renameBlocked: boolean
  canAdopt: boolean
  onAction: (action: FigureItemAction) => void
}): React.JSX.Element {
  return (
    <>
      <Item disabled={renameBlocked} onSelect={() => onAction('rename')}>
        <Pencil aria-hidden /> {renameBlocked ? FIGURE_RENAME_BLOCKED_LABEL : 'Rename…'}
      </Item>
      <Item onSelect={() => onAction('duplicate')}>
        <Copy aria-hidden /> Duplicate
      </Item>
      <Item className="text-destructive" onSelect={() => onAction('delete')}>
        <Trash2 aria-hidden /> Delete…
      </Item>
      <Separator />
      <Item onSelect={() => onAction('reveal')}>
        <FolderOpen aria-hidden /> {getRevealInFileManagerLabel()}
      </Item>
      <Item onSelect={() => onAction('include')}>
        <Copy aria-hidden /> Copy \includegraphics
      </Item>
      <Item disabled={hasScript === false} onSelect={() => onAction('script')}>
        <FileCode2 aria-hidden />
        {hasScript === false ? 'No script yet' : 'Open script'}
      </Item>
      {canAdopt ? (
        <Item disabled={renameBlocked} onSelect={() => onAction('adopt')}>
          <FolderInput aria-hidden />{' '}
          {renameBlocked ? FIGURE_MOVE_BLOCKED_LABEL : "Move to Aster's figures folder"}
        </Item>
      ) : null}
    </>
  )
}

export function FigureThumbnailImage({
  url,
  className,
  icon: Placeholder = Shapes
}: {
  url: string | null | undefined
  className?: string
  /** Shown while there is no picture (a plot not run yet shows a chart). */
  icon?: typeof Shapes
}): React.JSX.Element {
  return (
    <span
      className={cn(
        'flex items-center justify-center overflow-hidden rounded-lg border border-border bg-white transition-[border-color,box-shadow] duration-(--duration-fast)',
        className
      )}
    >
      {url ? (
        <img src={url} alt="" className="max-h-full max-w-full object-contain" />
      ) : (
        <Placeholder className="size-4 text-muted-foreground/60" aria-hidden />
      )}
    </span>
  )
}

/** A list entry's quiet status line item; `warn` adds a small dot. */
export function FigureListBadge({
  tone,
  children
}: {
  tone: 'ok' | 'busy' | 'warn'
  children: ReactNode
}): React.JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex h-4 items-center gap-1 text-2xs leading-none',
        tone === 'ok' && 'text-muted-foreground',
        tone === 'busy' && 'text-foreground',
        tone === 'warn' && 'text-muted-foreground'
      )}
    >
      {tone === 'warn' ? (
        <span className="size-1.5 shrink-0 rounded-full bg-status-warning" aria-hidden />
      ) : null}
      {children}
    </span>
  )
}

/** The badge for a paper copy that needs an update; null when it is fine. */
export function figurePaperIssue(paperState: FigurePaperState): string | null {
  return paperState === 'outdated'
    ? 'Paper copy outdated'
    : paperState === 'missing'
      ? 'Paper copy missing'
      : null
}

/** One editable figure: thumbnail, human title over its file name, badges, and its menus. */
export function ResearchFigureListItem({
  owner,
  folder,
  slug,
  meta,
  active,
  usages,
  exportState,
  paperState,
  updatingPaper,
  onSelect,
  onAction,
  onUpdatePaper
}: {
  owner: ProjectFileOwner
  folder: string | null
  slug: string
  meta: FigureListMeta | null
  active: boolean
  /** Manuscript lines that include it. */
  usages: readonly number[]
  exportState: FigureExportState
  paperState: FigurePaperState
  updatingPaper: boolean
  onSelect: () => void
  onAction: (action: FigureItemAction) => void
  onUpdatePaper: () => void
}): React.JSX.Element {
  const editing = useFigureAgentEditing(owner, slug)
  const renameBlocked = useFigureRenameBlocked(owner, slug)
  const [hasScript, setHasScript] = useState<boolean | null>(null)
  const title = meta?.title ?? slug
  const paperIssue = figurePaperIssue(paperState)
  const checkScript = (open: boolean): void => {
    if (open && folder) {
      void figureScriptExists(owner, { folder, slug }).then(setHasScript)
    }
  }
  return (
    <ContextMenu onOpenChange={checkScript}>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            'group relative flex flex-col gap-2 rounded-lg p-2 text-xs transition-colors duration-(--duration-fast) hover:bg-accent/70',
            active && 'bg-accent hover:bg-accent'
          )}
        >
          <button
            type="button"
            aria-current={active ? 'true' : undefined}
            aria-label={`Open figure ${title}`}
            className="flex flex-col gap-2 rounded-lg text-left outline-none"
            onClick={onSelect}
          >
            <FigureThumbnailImage
              url={meta?.thumbnail}
              className={cn('h-16 w-full', active && 'border-foreground/25 shadow-raised')}
            />
            <span className="flex min-w-0 flex-col px-0.5">
              <span className="truncate text-[13px] leading-snug font-medium" title={title}>
                {title}
              </span>
              {meta?.title ? (
                <span className="truncate text-xs text-muted-foreground">{slug}</span>
              ) : null}
            </span>
          </button>
          {usages.length || editing || exportState !== 'fresh' || paperIssue ? (
            <span className="flex flex-wrap gap-1 px-0.5">
              {usages.length ? (
                <FigureListBadge tone="ok">
                  <Check className="size-4" aria-hidden /> In paper
                </FigureListBadge>
              ) : null}
              {editing ? (
                <FigureListBadge tone="busy">
                  <Loader2 className="size-4 animate-spin" aria-hidden /> Agent editing
                </FigureListBadge>
              ) : null}
              {exportState === 'outdated' ? (
                <FigureListBadge tone="warn">Export outdated</FigureListBadge>
              ) : null}
              {exportState === 'missing' ? (
                <FigureListBadge tone="warn">Not exported</FigureListBadge>
              ) : null}
              {paperIssue ? <FigureListBadge tone="warn">{paperIssue}</FigureListBadge> : null}
            </span>
          ) : null}
          {paperIssue ? (
            <Button
              size="xs"
              variant="outline"
              className="ml-0.5 self-start"
              aria-label={`Update ${title} in paper`}
              disabled={updatingPaper}
              onClick={onUpdatePaper}
            >
              {updatingPaper ? 'Updating…' : 'Update in paper'}
            </Button>
          ) : null}
          <span className="absolute top-3 right-3 opacity-0 transition-opacity duration-(--duration-fast) group-focus-within:opacity-100 group-hover:opacity-100 has-[[data-state=open]]:opacity-100">
            <DropdownMenu onOpenChange={checkScript}>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon-xs"
                  variant="secondary"
                  aria-label={`Actions for ${title}`}
                  title="Figure actions"
                >
                  <MoreHorizontal aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-48">
                <FigureMenuItems
                  Item={DropdownMenuItem}
                  Separator={DropdownMenuSeparator}
                  hasScript={hasScript}
                  renameBlocked={renameBlocked}
                  canAdopt={paperState === 'beside'}
                  onAction={onAction}
                />
              </DropdownMenuContent>
            </DropdownMenu>
          </span>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-48">
        <FigureMenuItems
          Item={ContextMenuItem}
          Separator={ContextMenuSeparator}
          hasScript={hasScript}
          renameBlocked={renameBlocked}
          canAdopt={paperState === 'beside'}
          onAction={onAction}
        />
      </ContextMenuContent>
    </ContextMenu>
  )
}
