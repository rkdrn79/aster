import { useState, type ReactElement } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { WritingCodeFolder } from '../../../../shared/research/research-writing-results'
import { ResearchChip } from './research-chip'
import { researchErrorText } from './research-error-text'
import { researchHarnessBridge } from './use-research-harness-experiment'
import { writingCodeFolderInput } from './research-writing-quick-actions'

type Props = {
  owner: { hostId: string; workspacePath: string }
  label: string
  disabledReason: string | null
  sending: boolean
  /** Resolves to an error message, or null once the request went out. */
  onSend: (folders: string[]) => Promise<string | null>
  /** What opens the picker; a chip by default. */
  trigger?: ReactElement
}

/** "Write method from code": pick the code folders, then send the request. */
export function ResearchWritingCodeFolderPicker({
  owner,
  label,
  disabledReason,
  sending,
  onSend,
  trigger
}: Props): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [folders, setFolders] = useState<WritingCodeFolder[] | null>(null)
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set())
  const [other, setOther] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function load(): Promise<void> {
    const list = researchHarnessBridge().writingCodeFolders
    if (owner.hostId !== 'local' || !list) {
      setFolders([])
      return
    }
    try {
      const found = await list({ workspacePath: owner.workspacePath })
      setFolders(found)
      // Why the first: the harness lists the likeliest method code first.
      setPicked(new Set(found.slice(0, 1).map((folder) => folder.path)))
    } catch (cause) {
      setFolders([])
      setError(researchErrorText(cause))
    }
  }

  function toggle(path: string): void {
    setPicked((current) => {
      const next = new Set(current)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  const typed = writingCodeFolderInput(other)
  const chosen = [...picked, ...(typed && !picked.has(typed) ? [typed] : [])]

  async function send(): Promise<void> {
    setError(null)
    const failure = await onSend(chosen)
    if (failure) {
      setError(failure)
    } else {
      setOpen(false)
      setOther('')
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        // Why: a starter card trigger is only aria-disabled, so it still asks to open.
        if (next && disabledReason) {
          return
        }
        setOpen(next)
        setError(null)
        if (next && folders === null) {
          void load()
        }
      }}
    >
      <PopoverTrigger asChild>
        {trigger ?? (
          <ResearchChip
            aria-label={label}
            data-writing-action="method-from-code"
            title={disabledReason ?? undefined}
            disabled={sending || disabledReason !== null}
          >
            {sending ? 'Sending…' : label}
          </ResearchChip>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72" data-writing-code-folders="">
        <div className="space-y-3 p-3">
          <div className="space-y-1">
            <p className="text-[13px] font-medium">Code for the method</p>
            <p className="text-xs text-muted-foreground">
              The agent reads these folders and asks what the code cannot show.
            </p>
          </div>
          {folders === null ? (
            <p role="status" className="text-xs text-muted-foreground">
              Listing folders…
            </p>
          ) : folders.length ? (
            <ul className="scrollbar-sleek max-h-56 space-y-0.5 overflow-auto">
              {folders.map((folder) => (
                <li key={folder.path}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-accent">
                    <Checkbox
                      checked={picked.has(folder.path)}
                      onCheckedChange={() => toggle(folder.path)}
                    />
                    <span className="min-w-0 flex-1 truncate font-mono">{folder.path}</span>
                    <span className="shrink-0 text-2xs text-muted-foreground tabular-nums">
                      {folder.files} files
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">No code folders found; type one below.</p>
          )}
          <Input
            density="compact"
            aria-label="Another folder"
            placeholder="Another folder, e.g. src/model"
            value={other}
            onChange={(event) => setOther(event.target.value)}
          />
          {error ? (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end">
            <Button size="xs" disabled={sending || chosen.length === 0} onClick={() => void send()}>
              {sending ? 'Sending…' : 'Send to Writing agent'}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
