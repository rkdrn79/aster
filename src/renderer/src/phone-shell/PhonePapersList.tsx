import { useEffect, useState } from 'react'
import { BookOpen, FileText } from 'lucide-react'
import { useAppStore } from '@/store'
import { readResearchProjectLibraryOnHost } from '@/features/research/research-project-host-reads'
import { openWorkspaceFile } from '@/lib/workspace-file-open'
import { detectLanguage } from '@/lib/language-detect'
import { joinPath } from '@/lib/path'
import { runtimeEnvironmentIdOrLocalUnlessTwin } from '@/lib/worktree-runtime-owner'
import type { ResearchProjectLibraryReadResult } from '../../../shared/research/research-project-library-api'
import { PhoneEmptyState, PhoneRow, PhoneScrollBody, PhoneSection } from './PhoneListLayout'

type PaperRow = { path: string; title: string; detail: string }

function paperRows(result: ResearchProjectLibraryReadResult): PaperRow[] {
  if (result.papers.status !== 'present') {
    return []
  }
  const entries = result.bibliography.status === 'present' ? result.bibliography.value.entries : []
  return result.papers.value.pdfs.map((pdf) => {
    const entry = entries.find((candidate) => candidate.key === pdf.entryKey)
    const name = pdf.path.split('/').at(-1) ?? pdf.path
    return {
      path: pdf.path,
      title: entry?.title ?? name,
      detail: entry
        ? [entry.authors, entry.year, entry.venue].filter(Boolean).join(' · ')
        : `${Math.max(1, Math.round(pdf.bytes / 1024))} KB · no bibliography entry`
    }
  })
}

/** The project's papers folder as the host's Library reads it; a tap opens the PDF viewer. */
export function PhonePapersList({
  worktreeId,
  worktreePath
}: {
  worktreeId: string
  worktreePath: string
}): React.JSX.Element {
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'ready'; rows: PaperRow[]; papersPath: string }
    | { status: 'error'; message: string }
  >({ status: 'loading' })

  useEffect(() => {
    let active = true
    setState({ status: 'loading' })
    // Why local: in the web client the local target is the paired host that owns the workspace.
    readResearchProjectLibraryOnHost({ kind: 'local' }, worktreeId)
      .then((result) => {
        if (active) {
          setState({ status: 'ready', rows: paperRows(result), papersPath: result.papersPath })
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setState({
            status: 'error',
            message: error instanceof Error ? error.message : String(error)
          })
        }
      })
    return () => {
      active = false
    }
  }, [worktreeId])

  const open = (row: PaperRow): void => {
    openWorkspaceFile({
      kind: 'file',
      file: {
        filePath: joinPath(worktreePath, row.path),
        relativePath: row.path,
        worktreeId,
        runtimeEnvironmentId:
          runtimeEnvironmentIdOrLocalUnlessTwin(useAppStore.getState(), worktreeId) ?? undefined,
        language: detectLanguage(row.path),
        mode: 'edit',
        // Why: a phone reads papers; nothing here should start an edit or an autosave.
        readOnly: true
      },
      options: { preview: true }
    })
  }

  if (state.status !== 'ready') {
    return (
      <PhoneEmptyState
        icon={BookOpen}
        title={state.status === 'loading' ? 'Reading the Library…' : 'Library unavailable'}
      >
        {state.status === 'error' ? state.message : null}
      </PhoneEmptyState>
    )
  }
  if (state.rows.length === 0) {
    return (
      <PhoneEmptyState icon={BookOpen} title="No papers yet">
        PDFs saved in {state.papersPath} show up here.
      </PhoneEmptyState>
    )
  }
  return (
    <PhoneScrollBody>
      <PhoneSection label={state.papersPath}>
        {state.rows.map((row) => (
          <PhoneRow
            key={row.path}
            onClick={() => open(row)}
            leading={<FileText className="size-[18px]" aria-hidden />}
            title={row.title}
            subtitle={row.detail}
          />
        ))}
      </PhoneSection>
    </PhoneScrollBody>
  )
}
