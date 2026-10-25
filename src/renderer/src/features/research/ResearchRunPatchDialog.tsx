import { useEffect, useState } from 'react'
import { Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NativeChatDiffView } from '@/components/native-chat/NativeChatDiffView'
import { diffFromText } from '@/components/native-chat/native-chat-diff'
import { getIntlLocale } from '@/i18n/i18n'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import type { ResearchRunRecord } from '../../../../shared/research/research-records'
import type { ResearchRunPatch } from '../../../../shared/research/research-harness-results'
import { researchErrorText } from './research-error-text'
import { readResearchTextFile } from './research-file-reader'
import { catalogRunReference, researchHarnessBridge } from './use-research-harness-experiment'

const MAX_REMOTE_PATCH_BYTES = 1024 * 1024
const MAX_DIFF_LINES = 20_000

/** Splits the harness's leading `# key: value` capture comments from the diff itself. */
function splitPatchHeader(content: string): { fields: Map<string, string>; body: string } {
  const lines = content.split('\n')
  const fields = new Map<string, string>()
  let index = 0
  for (; index < lines.length && lines[index]?.startsWith('#'); index += 1) {
    const field = /^#\s*([\w -]+?):\s*(.+)$/.exec(lines[index] ?? '')
    if (field) {
      fields.set(field[1].toLowerCase(), field[2].trim())
    }
  }
  return { fields, body: lines.slice(index).join('\n') }
}

function captureCaption(fields: Map<string, string>): string | null {
  const commit = fields.get('commit')
  const capturedAt = fields.get('captured-at')
  const at = capturedAt ? new Date(capturedAt) : null
  const parts = [
    commit ? `commit ${commit.slice(0, 7)}` : null,
    at && !Number.isNaN(at.getTime()) ? `captured at ${at.toLocaleString(getIntlLocale())}` : null,
    fields.get('untracked files') ? `untracked files: ${fields.get('untracked files')}` : null
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : null
}

async function readRunPatch(run: ResearchRunRecord, patchFile: string): Promise<ResearchRunPatch> {
  const manifestPath = run.manifestPath ?? ''
  const reference = catalogRunReference(run)
  const runPatch = researchHarnessBridge().runPatch
  if (run.hostId === 'local' && reference && runPatch) {
    return runPatch({ workspacePath: run.workspacePath, run: reference })
  }
  // Why the runtime reader: it reaches SSH workspaces too, where the harness bridge cannot.
  const content = await readResearchTextFile(
    run,
    manifestPath.replace(/run\.json$/, patchFile),
    MAX_REMOTE_PATCH_BYTES
  )
  return { content, truncated: false, bytes: content.length }
}

function PatchBody({
  content,
  children
}: {
  content: string
  children: React.ReactNode
}): React.JSX.Element {
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle')
  const { fields, body } = splitPatchHeader(content)
  const caption = captureCaption(fields)
  const lines = diffFromText(body, MAX_DIFF_LINES)
  return (
    <div className="min-w-0 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p
          className="text-xs text-muted-foreground"
          title={fields.get('excluded') ? `Excluded: ${fields.get('excluded')}` : undefined}
        >
          {caption}
        </p>
        <Button
          size="xs"
          variant="outline"
          onClick={() =>
            // Why the whole content: git apply skips the capture comments, so it applies as copied.
            void window.api.ui.writeClipboardText(content).then(
              () => setCopy('copied'),
              () => setCopy('failed')
            )
          }
        >
          <Copy aria-hidden />
          {copy === 'copied' ? 'Copied' : 'Copy patch'}
        </Button>
      </div>
      {copy === 'failed' ? (
        <p role="alert" className="text-xs text-destructive">
          Could not copy the patch. Try again.
        </p>
      ) : null}
      <div className="scrollbar-sleek max-h-[60vh] overflow-auto">
        {lines ? (
          <NativeChatDiffView lines={lines} />
        ) : (
          <pre className="rounded-md bg-muted p-3 font-mono text-xs whitespace-pre">{body}</pre>
        )}
      </div>
      {children}
    </div>
  )
}

/** The uncommitted changes a Run launched with, read-only. */
export function ResearchRunPatchDialog({
  run,
  patchFile,
  commit,
  open,
  onClose
}: {
  run: ResearchRunRecord
  patchFile: string
  commit: string | null
  open: boolean
  onClose: () => void
}): React.JSX.Element {
  const [patch, setPatch] = useState<ResearchRunPatch | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }
    let active = true
    setPatch(null)
    setError(null)
    readRunPatch(run, patchFile).then(
      (value) => {
        if (active) {
          setPatch(value)
        }
      },
      (cause: unknown) => {
        if (active) {
          setError(researchErrorText(cause))
        }
      }
    )
    return () => {
      active = false
    }
  }, [open, patchFile, run])

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Code at launch</DialogTitle>
          <DialogDescription>
            Uncommitted changes when {run.name} started
            {commit ? `, on top of ${commit}` : ''}.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : patch ? (
          <PatchBody content={patch.content}>
            {patch.truncated ? (
              <p className="text-xs text-muted-foreground">
                First {Math.round(patch.content.length / 1024)} KB of{' '}
                {Math.round(patch.bytes / 1024)} KB shown.
              </p>
            ) : null}
          </PatchBody>
        ) : (
          <p className="text-sm text-muted-foreground">Reading…</p>
        )}
      </DialogContent>
    </Dialog>
  )
}
