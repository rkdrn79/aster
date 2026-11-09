import { useState } from 'react'
import { toast } from 'sonner'
import { figureSlug } from '../../../../research-harness/research-figures-model.mjs'
import type { RenameRequest } from './ResearchFigureListDialogs'
import type { FigureItemAction } from './ResearchFigureListItem'
import { useFigureEditorHandle } from './research-figure-editor-handle'
import {
  adoptFigure,
  duplicateFigure,
  figureIncludeLine,
  figureScriptExists,
  figureScriptPath,
  openProjectFileInEditor,
  renameFigure,
  restoreFigure,
  revealFigure,
  trashFigure
} from './research-figure-file-actions'
import {
  FigurePublishConflict,
  publishListedFigure,
  toastPublishConflict,
  toastPublished
} from './research-figure-publish'
import { uniqueFigureSlug } from './research-figure-list-model'
import {
  FIGURE_MOVE_BLOCKED_MESSAGE,
  FIGURE_RENAME_BLOCKED_MESSAGE,
  figureRenameBlocked
} from './research-figure-rename-guard'
import { forgetFigureTurn, moveFigureTurn } from './research-figure-turn'
import {
  renameFigureAgentChat,
  restoreDeletedFigureChat,
  unbindDeletedFigure
} from './research-figures-agent-session'
import { refreshFigureList, selectFigure, useResearchFigures } from './research-figures-store'
import type { ProjectFileOwner } from './research-project-files'

type Target = {
  slug: string
  title: string | null
  usages: readonly number[]
  /** The figure's own folder. */
  folder: string
  /** The paper's copy, for a figure published from the working folder; null otherwise. */
  paperCopy: string | null
}

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

/** Saves the figure first when it is open with edits, so a rename or delete never loses them. */
async function saveIfOpen(slug: string): Promise<boolean> {
  const handle = useFigureEditorHandle.getState().handle
  return handle && handle.target.slug === slug ? handle.save() : true
}

/** The list's figure menu: rename, duplicate, delete with undo, reveal, copy, open script. */
export function useFigureListActions(input: {
  owner: ProjectFileOwner
  folder: string | null
  manuscript: string | null
  taken: ReadonlySet<string>
}) {
  const { owner, folder, manuscript, taken } = input
  const [updating, setUpdating] = useState<string | null>(null)
  const [rename, setRename] = useState<RenameRequest | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Target | null>(null)

  async function trash(target: Target, removePaperCopy = false): Promise<void> {
    if (!(await saveIfOpen(target.slug))) {
      return
    }
    const { folder: figureFolder, slug } = target
    try {
      const moves = await trashFigure(
        owner,
        { folder: figureFolder, slug },
        removePaperCopy ? target.paperCopy : null
      )
      // Why after the move: a figure that could not be trashed keeps its chat.
      const chat = await unbindDeletedFigure(owner, target.slug).catch(() => null)
      forgetFigureTurn({ owner, folder: figureFolder, slug })
      await refreshFigureList(owner)
      toast(`Moved “${target.title ?? target.slug}” to the project trash.`, {
        action: {
          label: 'Undo',
          onClick: () =>
            void restoreFigure(owner, moves)
              .then(async () => {
                selectFigure(owner, { kind: 'figure', slug: target.slug })
                await refreshFigureList(owner)
                if (chat) {
                  await restoreDeletedFigureChat(owner, target.slug, chat)
                }
              })
              .catch((cause: unknown) => toast.error(`Undo failed. ${errorText(cause)}`))
        }
      })
    } catch (cause) {
      toast.error(`The figure was not deleted. ${errorText(cause)}`)
    }
  }

  /** "Update in paper" and "Paper copy missing": publishes the figure as it is now. */
  async function updateInPaper(target: Target, replace = false): Promise<void> {
    if (!manuscript) {
      return
    }
    const files = { folder: target.folder, slug: target.slug }
    setUpdating(target.slug)
    try {
      const result = await publishListedFigure(owner, files, manuscript, replace)
      await refreshFigureList(owner).catch(() => undefined)
      toastPublished(result, 'Updated')
    } catch (cause) {
      if (cause instanceof FigurePublishConflict) {
        toastPublishConflict(cause, () => updateInPaper(target, true))
      } else {
        toast.error(`The paper was not updated. ${errorText(cause)}`)
      }
    } finally {
      setUpdating(null)
    }
  }

  async function adopt(target: Target): Promise<void> {
    // Why here too: the agent can start between opening the menu and choosing the item.
    if (figureRenameBlocked(owner, target.slug)) {
      toast.error(FIGURE_MOVE_BLOCKED_MESSAGE)
      return
    }
    if (!folder || !manuscript || !(await saveIfOpen(target.slug))) {
      return
    }
    try {
      const undo = await adoptFigure(
        owner,
        { folder: target.folder, slug: target.slug },
        { workFolder: folder, manuscript }
      )
      await refreshFigureList(owner)
      toast.success(`Moved to ${folder}. The paper keeps its PDF until you update it.`, {
        action: {
          label: 'Undo',
          onClick: () =>
            void undo()
              .then(() => refreshFigureList(owner))
              .catch((cause: unknown) => toast.error(`Undo failed. ${errorText(cause)}`))
        }
      })
    } catch (cause) {
      toast.error(`The figure was not moved. ${errorText(cause)}`)
    }
  }

  async function run(action: FigureItemAction, target: Target): Promise<void> {
    if (!folder) {
      return
    }
    const files = { folder: target.folder, slug: target.slug }
    switch (action) {
      case 'rename':
        setRename({ ...target, manuscript, published: target.paperCopy !== null })
        return
      case 'delete':
        if (target.usages.length || target.paperCopy) {
          setConfirmDelete(target)
        } else {
          await trash(target)
        }
        return
      case 'duplicate': {
        const slug = uniqueFigureSlug(target.slug, taken)
        try {
          await saveIfOpen(target.slug)
          await duplicateFigure(owner, files, slug, folder)
          selectFigure(owner, { kind: 'figure', slug })
          await refreshFigureList(owner)
        } catch (cause) {
          toast.error(`The figure was not duplicated. ${errorText(cause)}`)
        }
        return
      }
      case 'reveal':
        await revealFigure(owner, files)
        return
      case 'include':
        await window.api.ui.writeClipboardText(figureIncludeLine(target.slug))
        toast.success(
          target.folder === folder && !target.paperCopy
            ? '\\includegraphics line copied. Use in paper puts the PDF there.'
            : '\\includegraphics line copied.'
        )
        return
      case 'adopt':
        await adopt(target)
        return
      case 'script':
        if (await figureScriptExists(owner, files)) {
          openProjectFileInEditor(owner, figureScriptPath(target.folder, target.slug))
        } else {
          toast('This figure has no script yet; the agent writes one when it draws.')
        }
    }
  }

  async function submitRename(next: {
    slug: string
    title: string | null
    updateManuscript: boolean
  }): Promise<string | null> {
    if (!folder || !rename) {
      return 'The figures folder is not known yet.'
    }
    const from = rename.slug
    // Why here too: the agent can start while this dialog is open.
    if (figureRenameBlocked(owner, from)) {
      return FIGURE_RENAME_BLOCKED_MESSAGE
    }
    if (!(await saveIfOpen(from))) {
      return 'The figure could not be saved first. Resolve the message on the canvas.'
    }
    const open = useResearchFigures.getState().selected
    const wasOpen = open?.kind === 'figure' && open.slug === from
    try {
      const updated = await renameFigure(
        owner,
        { folder: rename.folder, slug: from },
        {
          slug: next.slug || figureSlug(next.title ?? from),
          title: next.title,
          manuscript: next.updateManuscript ? manuscript : null,
          published: rename.published ? manuscript : null
        }
      )
      moveFigureTurn({ owner, folder: rename.folder, slug: from }, next.slug)
      await renameFigureAgentChat(
        owner,
        { slug: from, title: rename.title },
        { slug: next.slug, title: next.title }
      ).catch((cause: unknown) =>
        toast.error(`The figure's chat was not moved to its new name. ${errorText(cause)}`)
      )
      if (wasOpen) {
        selectFigure(owner, { kind: 'figure', slug: next.slug })
      }
      await refreshFigureList(owner)
      setRename(null)
      if (updated) {
        toast.success(
          `Renamed; updated ${updated} \\includegraphics line${updated === 1 ? '' : 's'}.`
        )
      }
      return null
    } catch (cause) {
      return `The figure was not renamed. ${errorText(cause)}`
    }
  }

  return {
    run: (action: FigureItemAction, target: Target) => void run(action, target),
    updating,
    updateInPaper: (target: Target) => void updateInPaper(target),
    rename,
    closeRename: () => setRename(null),
    submitRename,
    confirmDelete,
    closeDelete: () => setConfirmDelete(null),
    deleteConfirmed: (removePaperCopy: boolean) => {
      const target = confirmDelete
      setConfirmDelete(null)
      if (target) {
        void trash(target, removePaperCopy)
      }
    }
  }
}
