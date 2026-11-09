import { useState } from 'react'
import { toast } from 'sonner'
import { figureSlug } from '../../../../research-harness/research-figures-model.mjs'
import type { RenameRequest } from './ResearchFigureListDialogs'
import type { FigureItemAction } from './ResearchFigureListItem'
import { useFigureEditorHandle } from './research-figure-editor-handle'
import {
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
import { uniqueFigureSlug } from './research-figure-list-model'
import { refreshFigureList, selectFigure, useResearchFigures } from './research-figures-store'
import type { ProjectFileOwner } from './research-project-files'

type Target = { slug: string; title: string | null; usages: readonly number[] }

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
  const [rename, setRename] = useState<RenameRequest | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Target | null>(null)

  async function trash(target: Target): Promise<void> {
    if (!folder || !(await saveIfOpen(target.slug))) {
      return
    }
    try {
      const moves = await trashFigure(owner, { folder, slug: target.slug })
      await refreshFigureList(owner)
      toast(`Moved “${target.title ?? target.slug}” to the project trash.`, {
        action: {
          label: 'Undo',
          onClick: () =>
            void restoreFigure(owner, moves)
              .then(() => {
                selectFigure(owner, { kind: 'figure', slug: target.slug })
                return refreshFigureList(owner)
              })
              .catch((cause: unknown) => toast.error(`Undo failed. ${errorText(cause)}`))
        }
      })
    } catch (cause) {
      toast.error(`The figure was not deleted. ${errorText(cause)}`)
    }
  }

  async function run(action: FigureItemAction, target: Target): Promise<void> {
    if (!folder) {
      return
    }
    const files = { folder, slug: target.slug }
    switch (action) {
      case 'rename':
        setRename({ ...target, manuscript })
        return
      case 'delete':
        if (target.usages.length) {
          setConfirmDelete(target)
        } else {
          await trash(target)
        }
        return
      case 'duplicate': {
        const slug = uniqueFigureSlug(target.slug, taken)
        try {
          await saveIfOpen(target.slug)
          await duplicateFigure(owner, files, slug)
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
        toast.success('\\includegraphics line copied.')
        return
      case 'script':
        if (await figureScriptExists(owner, files)) {
          openProjectFileInEditor(owner, figureScriptPath(folder, target.slug))
        } else {
          toast('This figure has no script yet; the agent writes one when it draws.')
        }
        return
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
    if (!(await saveIfOpen(from))) {
      return 'The figure could not be saved first. Resolve the message on the canvas.'
    }
    const open = useResearchFigures.getState().selected
    const wasOpen = open?.kind === 'figure' && open.slug === from
    try {
      const updated = await renameFigure(
        owner,
        { folder, slug: from },
        {
          slug: next.slug || figureSlug(next.title ?? from),
          title: next.title,
          manuscript: next.updateManuscript ? manuscript : null
        }
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
    rename,
    closeRename: () => setRename(null),
    submitRename,
    confirmDelete,
    closeDelete: () => setConfirmDelete(null),
    deleteConfirmed: () => {
      const target = confirmDelete
      setConfirmDelete(null)
      if (target) {
        void trash(target)
      }
    }
  }
}
