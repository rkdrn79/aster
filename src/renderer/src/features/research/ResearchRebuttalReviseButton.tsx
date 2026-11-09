import { useState } from 'react'
import { WandSparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'

const QUICK_INSTRUCTIONS = [
  'Make it shorter',
  'Lead with the number',
  'More direct',
  'Softer tone'
] as const

type Props = {
  /** The selected passage, or null for the whole reply. */
  passage: string | null
  disabled: boolean
  /** Resolves to an error message, or null once the agent has the request. */
  onRevise: (passage: string | null, instruction: string) => Promise<string | null>
}

/** Asks the author-side agent to revise a selected passage, or the whole reply. */
export function ResearchRebuttalReviseButton({
  passage,
  disabled,
  onRevise
}: Props): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [instruction, setInstruction] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [held, setHeld] = useState<string | null>(null)
  const target = open ? held : passage

  async function send(text: string): Promise<void> {
    const value = text.trim()
    if (!value || sending) {
      return
    }
    setSending(true)
    setError(null)
    const failure = await onRevise(target, value)
    setSending(false)
    if (failure) {
      setError(failure)
      return
    }
    setInstruction('')
    setOpen(false)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        // Why held: focus moving into the popover clears the textarea's selection.
        if (next) {
          setHeld(passage)
        }
        setOpen(next)
      }}
    >
      <PopoverTrigger asChild>
        <Button size="xs" variant="ghost" disabled={disabled}>
          <WandSparkles aria-hidden />
          {passage ? 'Revise selection' : 'Revise'}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="space-y-2">
          <p className="text-xs font-medium">
            {target ? 'Revise the selected passage' : 'Revise this reply'}
          </p>
          {target ? (
            <blockquote className="scrollbar-sleek max-h-24 overflow-auto rounded-sm border-l-2 border-border bg-muted/40 p-2 text-xs whitespace-pre-wrap">
              {target}
            </blockquote>
          ) : null}
          <div className="flex flex-wrap gap-1">
            {QUICK_INSTRUCTIONS.map((quick) => (
              <Button
                key={quick}
                size="xs"
                variant="outline"
                disabled={sending}
                onClick={() => void send(quick)}
              >
                {quick}
              </Button>
            ))}
          </div>
          <Textarea
            value={instruction}
            rows={2}
            autoFocus
            placeholder="Or say what should change…"
            disabled={sending}
            onChange={(event) => setInstruction(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault()
                void send(instruction)
              }
            }}
          />
          {error ? (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex items-center justify-between gap-2">
            <span className="text-2xs text-muted-foreground">
              The agent never invents numbers or citations.
            </span>
            <Button
              size="xs"
              disabled={sending || !instruction.trim()}
              onClick={() => void send(instruction)}
            >
              {sending ? 'Sending…' : 'Send'}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
