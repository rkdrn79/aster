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
  className
}: {
  url: string | null | undefined
  className?: string
}): React.JSX.Element {
  return (
    <span
      className={cn(
        'flex items-center justify-center overflow-hidden rounded-sm border border-border bg-white',
        className
      )}
    >
      {url ? (
        <img src={url} alt="" className="max-h-full max-w-full object-contain" />
      ) : (
        <Shapes className="size-4 text-muted-foreground/60" aria-hidden />
      )}
    </span>
  )
}

function Badge({ tone, children }: { tone: 'ok' | 'busy' | 'warn'; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded px-1 py-px text-2xs font-medium leading-tight',
        tone === 'ok' && 'bg-muted text-foreground',
        tone === 'busy' && 'bg-primary/10 text-foreground',
        tone === 'warn' && 'bg-status-warning/15 text-status-warning'
      )}
    >
      {children}
    </span>
  )
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
  const paperIssue =
    paperState === 'outdated'
      ? 'Paper copy outdated'
      : paperState === 'missing'
        ? 'Paper copy missing'
        : null
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
            'group relative flex flex-col gap-1 rounded-md p-1.5 text-xs hover:bg-accent',
            active && 'bg-accent'
          )}
        >
          <button
            type="button"
            aria-current={active ? 'true' : undefined}
            aria-label={`Open figure ${title}`}
            className="flex flex-col gap-1 rounded-sm text-left outline-none"
            onClick={onSelect}
          >
            <FigureThumbnailImage url={meta?.thumbnail} className="h-16 w-full" />
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-medium" title={title}>
                {title}
              </span>
              {meta?.title ? (
                <span className="truncate text-2xs text-muted-foreground">{slug}</span>
              ) : null}
            </span>
          </button>
          {usages.length || editing || exportState !== 'fresh' || paperIssue ? (
            <span className="flex flex-wrap gap-1">
              {usages.length ? (
                <Badge tone="ok">
                  In paper <Check className="size-2.5" aria-hidden />
                </Badge>
              ) : null}
              {editing ? (
                <Badge tone="busy">
                  <Loader2 className="size-2.5 animate-spin" aria-hidden /> Agent editing
                </Badge>
              ) : null}
              {exportState === 'outdated' ? <Badge tone="warn">Export outdated</Badge> : null}
              {exportState === 'missing' ? <Badge tone="warn">Not exported</Badge> : null}
              {paperIssue ? <Badge tone="warn">{paperIssue}</Badge> : null}
            </span>
          ) : null}
          {paperIssue ? (
            <Button
              size="xs"
              variant="outline"
              className="self-start"
              aria-label={`Update ${title} in paper`}
              disabled={updatingPaper}
              onClick={onUpdatePaper}
            >
              {updatingPaper ? 'Updating…' : 'Update in paper'}
            </Button>
          ) : null}
          <span className="absolute top-2.5 right-2.5 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 has-[[data-state=open]]:opacity-100">
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
