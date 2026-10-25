import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Copy, ExternalLink, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  libraryScopeKey,
  type LibraryPaper,
  type LibraryScope,
  type PaperHighlight,
  type PaperReadingStatus
} from '../../../../shared/research/research-library'
import type { TuiAgent } from '../../../../shared/tui-agent'
import { ResearchAgentChatPane } from './ResearchAgentChatPane'
import { paperBibtex, paperCitationText } from './research-library-citation'
import { ResearchLibraryHighlights } from './research-library-highlights'
import { ResearchLibraryPaperHeader } from './research-library-paper-header'
import { STATUS_LABELS } from './research-library-paper-list'
import { removeLibraryPaper, updateLibraryPaper } from './research-library-paper-records'
import { ResearchLibraryReadingActions } from './research-library-reading-actions'
import {
  bindReadingSession,
  launchReadingChat,
  type ReadingRequest
} from './research-library-reading-agent'
import type { ReadingLanguageId } from './research-library-reading-language'
import { useResearchLibrary } from './research-library-store'

export type PaperPanelTab = 'overview' | 'highlights' | 'agent'

const TABS: { id: PaperPanelTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'highlights', label: 'Highlights' },
  { id: 'agent', label: 'Reading agent' }
]

const NOTES_SAVE_DELAY_MS = 800

function PaperNotes({ paper }: { paper: LibraryPaper }): React.JSX.Element {
  const [draft, setDraft] = useState(paper.notes ?? '')
  const [status, setStatus] = useState<'saved' | 'pending' | 'error'>('saved')
  const pending = useRef<string | null>(null)

  useEffect(() => {
    if (pending.current === null) {
      return
    }
    const timer = window.setTimeout(() => {
      const value = pending.current
      pending.current = null
      if (value === null) {
        return
      }
      void updateLibraryPaper(paper.id, (current) => ({
        ...current,
        notes: value.trim() ? value : undefined
      })).then(
        () => setStatus(pending.current === null ? 'saved' : 'pending'),
        () => setStatus('error')
      )
    }, NOTES_SAVE_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [draft, paper.id])

  useEffect(
    () => () => {
      // Why: switching papers within the debounce window must not drop the last keystrokes.
      const value = pending.current
      if (value !== null) {
        void updateLibraryPaper(paper.id, (current) => ({
          ...current,
          notes: value.trim() ? value : undefined
        }))
      }
    },
    [paper.id]
  )

  return (
    <section aria-label="Reading notes">
      <div className="mb-1.5 flex items-baseline justify-between">
        <h3 className="text-xs font-semibold">Notes</h3>
        <span className="text-2xs text-muted-foreground" role="status">
          {status === 'pending' ? 'Saving…' : status === 'error' ? 'Not saved' : ''}
        </span>
      </div>
      <Textarea
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value)
          pending.current = event.target.value
          setStatus('pending')
        }}
        rows={8}
        maxLength={50_000}
        placeholder="Key claims, how it relates to your project, questions to follow up…"
        className="text-sm"
      />
    </section>
  )
}

function PaperOverview({
  paper,
  onEdit,
  onRemoved
}: {
  paper: LibraryPaper
  onEdit: () => void
  onRemoved: () => void
}): React.JSX.Element {
  const [confirmRemove, setConfirmRemove] = useState(false)
  // Why: fixed per paper so writing the first note never collapses the abstract mid-typing.
  const [abstractInitiallyOpen] = useState(() => !paper.notes)
  const sourceUrl = paper.externalUrl

  async function copy(text: string, label: string): Promise<void> {
    try {
      await window.api.ui.writeClipboardText(text)
      toast.success(`${label} copied`)
    } catch (cause) {
      toast.error(`${label} could not be copied`, { description: String(cause) })
    }
  }

  async function setStatus(status: PaperReadingStatus): Promise<void> {
    try {
      await updateLibraryPaper(paper.id, (current) => ({ ...current, status }))
    } catch (cause) {
      toast.error('Reading status was not saved', { description: String(cause) })
    }
  }

  return (
    <div className="scrollbar-sleek min-h-0 flex-1 space-y-5 overflow-auto p-4">
      <ResearchLibraryPaperHeader paper={paper} />
      <div className="flex gap-1" role="group" aria-label="Reading status">
        {(['unread', 'reading', 'read'] as const).map((status) => (
          <Button
            key={status}
            size="xs"
            variant={paper.status === status ? 'secondary' : 'ghost'}
            aria-pressed={paper.status === status}
            onClick={() => void setStatus(status)}
          >
            {STATUS_LABELS[status]}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Button
          size="xs"
          variant="outline"
          onClick={() => void copy(paperCitationText(paper), 'Citation')}
        >
          <Copy aria-hidden /> Citation
        </Button>
        <Button size="xs" variant="outline" onClick={() => void copy(paperBibtex(paper), 'BibTeX')}>
          <Copy aria-hidden /> BibTeX
        </Button>
        {sourceUrl ? (
          <Button
            size="xs"
            variant="outline"
            onClick={() => void window.api.shell.openUrl(sourceUrl)}
          >
            <ExternalLink aria-hidden /> Source
          </Button>
        ) : null}
        <Button size="xs" variant="ghost" onClick={onEdit}>
          <Pencil aria-hidden /> Edit
        </Button>
      </div>
      {paper.abstract ? (
        <details open={abstractInitiallyOpen}>
          <summary className="cursor-pointer text-xs font-semibold">Abstract</summary>
          <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed">{paper.abstract}</p>
        </details>
      ) : null}
      <PaperNotes key={paper.id} paper={paper} />
      <div className="border-t border-border pt-3">
        {confirmRemove ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Remove this paper and its highlights? The PDF file stays in the project.
            </span>
            <Button
              size="xs"
              variant="destructive"
              onClick={() =>
                void removeLibraryPaper(paper.id).then(onRemoved, (cause: unknown) =>
                  toast.error('Paper was not removed', { description: String(cause) })
                )
              }
            >
              Remove
            </Button>
            <Button size="xs" variant="ghost" onClick={() => setConfirmRemove(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button size="xs" variant="ghost" onClick={() => setConfirmRemove(true)}>
            Remove from library
          </Button>
        )}
      </div>
    </div>
  )
}

export function ResearchLibraryPaperPanel({
  scope,
  paper,
  highlights,
  tab,
  language,
  onTabChange,
  onLanguageChange,
  onNavigate,
  onRequest,
  onEdit,
  onRemoved
}: {
  scope: LibraryScope
  paper: LibraryPaper
  highlights: readonly PaperHighlight[]
  tab: PaperPanelTab
  language: ReadingLanguageId
  onTabChange: (tab: PaperPanelTab) => void
  onLanguageChange: (language: ReadingLanguageId) => void
  onNavigate: (highlight: PaperHighlight) => void
  onRequest: (request: ReadingRequest) => Promise<string | null>
  onEdit: () => void
  onRemoved: () => void
}): React.JSX.Element {
  const boundSessionId = useResearchLibrary(
    (state) => state.document?.readingAgentSessionByScope[libraryScopeKey(scope)]
  )

  return (
    <aside aria-label="Paper details" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div
        className="flex h-10 shrink-0 items-center gap-1 border-b border-border px-2"
        role="tablist"
      >
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            className={cn(
              'rounded-md px-2 py-1 text-xs whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring',
              tab === entry.id && 'bg-accent text-foreground'
            )}
            onClick={() => onTabChange(entry.id)}
          >
            {entry.label}
            {entry.id === 'highlights' && highlights.length ? (
              <span className="ml-1 tabular-nums text-muted-foreground">{highlights.length}</span>
            ) : null}
          </button>
        ))}
      </div>
      {tab === 'overview' ? (
        <PaperOverview key={paper.id} paper={paper} onEdit={onEdit} onRemoved={onRemoved} />
      ) : null}
      {tab === 'highlights' ? (
        <ResearchLibraryHighlights
          highlights={highlights}
          onNavigate={onNavigate}
          onExplain={(highlight) =>
            onRequest({
              kind: 'explain',
              selection: {
                text: highlight.text,
                pageNumber: highlight.pageNumber,
                anchor: { x: 0, y: 0 }
              }
            })
          }
        />
      ) : null}
      {/* Why: the chat stays mounted so switching tabs never drops a streaming reply. */}
      <ResearchAgentChatPane
        workspaceId={scope.workspaceId}
        hostId={scope.hostId}
        boundSessionId={boundSessionId}
        home={{ kind: 'library' }}
        title="Reading agent"
        sessionLabel="Reading agent chat"
        emptyHint="Start a reading chat, or select text in the PDF and choose Explain."
        visible={tab === 'agent'}
        className="flex-1"
        onBind={(sessionId) => bindReadingSession(scope, sessionId)}
        onLaunch={(agent: TuiAgent) => launchReadingChat(scope, agent)}
        toolbar={
          <ResearchLibraryReadingActions
            language={language}
            onLanguageChange={onLanguageChange}
            onRequest={onRequest}
          />
        }
      />
    </aside>
  )
}
