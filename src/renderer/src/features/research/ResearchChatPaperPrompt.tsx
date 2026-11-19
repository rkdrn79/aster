import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { BookCheck, BookPlus, SlidersHorizontal, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import type { NativeChatLiveSession } from '@/components/native-chat/native-chat-live-session-contract'
import { extractIpcErrorMessage } from '@/lib/ipc-error'
import {
  addChatPapers,
  dismissChatPapers,
  undoChatPaperNotice,
  type ChatPaperContext
} from './research-chat-papers-actions'
import {
  CHAT_PAPER_MODES,
  chooseChatPaperMode,
  type ChatPaperMode
} from './research-chat-papers-mode'
import {
  showChatPaperNotice,
  type ChatPaperCandidate,
  type ChatPaperNotice
} from './research-chat-papers-store'
import { useResearchChatPapers } from './use-research-chat-papers'

const NOTICE_MS = 20_000
const AGENT_NAMES: Record<string, string> = {
  'claude-code': 'Claude',
  codex: 'Codex',
  'gemini-cli': 'Gemini'
}

function yearSuffix(candidate: ChatPaperCandidate): string {
  return candidate.draft.year ? ` (${candidate.draft.year})` : ''
}

/** "arXiv:1706.03762 · Vaswani et al. · asked by Claude: closest prior method" */
function detailLine(candidate: ChatPaperCandidate): string {
  const { draft, request } = candidate
  const firstAuthor = draft.authors?.split(',')[0]?.trim()
  const authors = firstAuthor
    ? `${firstAuthor}${draft.authors && draft.authors.includes(',') ? ' et al.' : ''}`
    : null
  const source = draft.arxivId
    ? `arXiv:${draft.arxivId}`
    : draft.doi
      ? `DOI ${draft.doi}`
      : draft.venue
  const asked = request
    ? `asked by ${request.agent ? (AGENT_NAMES[request.agent] ?? request.agent) : 'an agent'}${
        request.note ? `: ${request.note}` : ''
      }`
    : null
  return [source, authors, asked].filter(Boolean).join(' · ')
}

/** Papers a chat mentioned that the project's Library lacks, and the "added" notice, above the
 *  composer. Mounted in every structured chat; draws nothing until there is something to say. */
export function ResearchChatPaperPrompt({
  sessionId,
  workspaceId,
  session,
  isVisible
}: {
  sessionId: string
  workspaceId: string | null | undefined
  session: Pick<NativeChatLiveSession, 'messages' | 'status' | 'readPhase'>
  isVisible: boolean
}): React.JSX.Element | null {
  const { context, mode, pending, notice } = useResearchChatPapers({
    workspaceId,
    sessionId,
    session,
    isVisible
  })
  if (!context || (!pending.length && !notice)) {
    return null
  }
  return (
    <div
      data-research-chat-papers=""
      className="mx-auto flex w-full max-w-3xl flex-col gap-2 px-4 pb-2"
    >
      {notice ? <AddedNotice context={context} notice={notice} mode={mode} /> : null}
      {pending.length ? <PaperPrompt context={context} pending={pending} mode={mode} /> : null}
    </div>
  )
}

function ChatPapersModeMenu({ mode }: { mode: ChatPaperMode }): React.JSX.Element {
  const label = CHAT_PAPER_MODES.find((entry) => entry.id === mode)?.label ?? 'Ask'
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon-xs" variant="ghost" aria-label={`Papers mentioned in chat: ${label}`}>
          <SlidersHorizontal aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>Papers mentioned in chat</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={mode}
          onValueChange={(value) => {
            const next = CHAT_PAPER_MODES.find((entry) => entry.id === value)
            if (next) {
              chooseChatPaperMode(next.id)
            }
          }}
        >
          {CHAT_PAPER_MODES.map((entry) => (
            <DropdownMenuRadioItem key={entry.id} value={entry.id}>
              {entry.menuLabel}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <p className="px-2 pt-1 pb-2 text-2xs leading-4 text-muted-foreground">
          For every project. Also in Settings, under Research.
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function PaperPrompt({
  context,
  pending,
  mode
}: {
  context: ChatPaperContext
  pending: ChatPaperCandidate[]
  mode: ChatPaperMode
}): React.JSX.Element {
  const [busy, setBusy] = useState(false)
  const single = pending.length === 1 ? pending[0] : null

  async function add(always = false): Promise<void> {
    if (busy) {
      return
    }
    setBusy(true)
    if (always) {
      chooseChatPaperMode('auto')
    }
    try {
      await addChatPapers(context, pending, 'person')
    } catch (cause) {
      toast.error('Papers were not added', {
        description: extractIpcErrorMessage(cause, 'The Library could not be saved.')
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section
      aria-label={single ? 'New paper in this chat' : 'New papers in this chat'}
      data-research-chat-paper-prompt={pending.length}
      className="@container rounded-lg bg-card px-3 py-2 text-xs shadow-raised animate-pop-in [--pop-from-y:4px] motion-reduce:animate-none"
    >
      <div className="flex gap-2">
        <BookPlus className="mt-px size-4 shrink-0 text-muted-foreground" aria-hidden />
        {/* Why a container query: a narrow chat pane puts the actions under the text, not between. */}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 @lg:flex-row @lg:items-start @lg:gap-2">
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2">
              {single ? (
                <>
                  <span className="text-muted-foreground">New paper: </span>
                  <span className="font-medium">{single.draft.title}</span>
                  {yearSuffix(single)}
                </>
              ) : (
                <span className="font-medium">{pending.length} new papers in this chat</span>
              )}
            </p>
            {single ? (
              <p className="mt-0.5 truncate text-muted-foreground">{detailLine(single)}</p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button size="xs" disabled={busy} onClick={() => void add()}>
              {busy ? 'Adding…' : 'Add to Library'}
            </Button>
            <Button
              size="xs"
              variant="ghost"
              disabled={busy}
              onClick={() =>
                dismissChatPapers(
                  context.chatKey,
                  pending.map((candidate) => candidate.key)
                )
              }
            >
              Not now
            </Button>
            {mode === 'auto' ? null : (
              <Button
                size="xs"
                variant="ghost"
                disabled={busy}
                title="Add these, and add papers mentioned in chats from now on"
                onClick={() => void add(true)}
              >
                Always add
              </Button>
            )}
            <ChatPapersModeMenu mode={mode} />
          </div>
        </div>
      </div>
      {single ? null : (
        <ul className="mt-1.5 space-y-1 pl-6">
          {pending.map((candidate) => (
            <li key={candidate.key} className="flex items-start gap-2">
              <span className="line-clamp-2 min-w-0 flex-1">
                {candidate.draft.title}
                {yearSuffix(candidate)}
                <span className="text-muted-foreground"> · {detailLine(candidate)}</span>
              </span>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label={`Not now: ${candidate.draft.title}`}
                disabled={busy}
                onClick={() => dismissChatPapers(context.chatKey, [candidate.key])}
              >
                <X aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function AddedNotice({
  context,
  notice,
  mode
}: {
  context: ChatPaperContext
  notice: ChatPaperNotice
  mode: ChatPaperMode
}): React.JSX.Element {
  const [undoing, setUndoing] = useState(false)
  useEffect(() => {
    const timer = window.setTimeout(() => showChatPaperNotice(context.chatKey, null), NOTICE_MS)
    return () => window.clearTimeout(timer)
  }, [context.chatKey, notice.id])
  const count = notice.paperIds.length
  return (
    <div
      role="status"
      data-research-chat-paper-notice={count}
      className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-1 text-xs text-muted-foreground"
    >
      <BookCheck className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate">
        {count === 1
          ? `1 paper added to Library: ${notice.titles[0]}`
          : `${count} papers added to Library`}
      </span>
      <Button
        size="xs"
        variant="ghost"
        disabled={undoing}
        onClick={() => {
          setUndoing(true)
          void undoChatPaperNotice(context.chatKey, notice)
            .catch((cause: unknown) =>
              toast.error('Undo failed', {
                description: extractIpcErrorMessage(cause, 'The Library could not be saved.')
              })
            )
            .finally(() => setUndoing(false))
        }}
      >
        Undo
      </Button>
      <ChatPapersModeMenu mode={mode} />
      <Button
        size="icon-xs"
        variant="ghost"
        aria-label="Dismiss"
        onClick={() => showChatPaperNotice(context.chatKey, null)}
      >
        <X aria-hidden />
      </Button>
    </div>
  )
}
