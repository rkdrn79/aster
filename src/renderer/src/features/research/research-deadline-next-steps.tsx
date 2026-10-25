import { useState } from 'react'
import { CalendarPlus, ChevronRight, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import type { MissingMilestone, SubmissionPrompt } from './research-deadline-progress'

// Why: tracking a whole topic can surface many just-closed calls; past this, fold them into one line.
const PROMPTS_SHOWN_OPEN = 2

const ROW =
  'flex items-center gap-3 rounded-md border border-dashed border-border px-3 py-2 text-sm'

type Props = {
  prompts: SubmissionPrompt[]
  missing: MissingMilestone[]
  saving: boolean
  onMarkSubmitted: (prompt: SubmissionPrompt) => void
  onAddDate: (milestone: MissingMilestone) => void
}

function PromptRow({
  prompt,
  saving,
  short,
  onMarkSubmitted
}: {
  prompt: SubmissionPrompt
  saving: boolean
  short: boolean
  onMarkSubmitted: (prompt: SubmissionPrompt) => void
}): React.JSX.Element {
  return (
    <div className={ROW}>
      <Send className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <p className="min-w-0 flex-1">
        {short ? (
          <span className="font-medium">{prompt.title}</span>
        ) : (
          <>
            Did you submit to <span className="font-medium">{prompt.title}</span>? Mark it to follow
            its rebuttal and decision dates.
          </>
        )}
      </p>
      <Button variant="outline" size="xs" disabled={saving} onClick={() => onMarkSubmitted(prompt)}>
        Mark submitted
      </Button>
    </div>
  )
}

/** Asks about papers whose deadline just passed and dates the sources do not list yet. */
export function ResearchDeadlineNextSteps({
  prompts,
  missing,
  saving,
  onMarkSubmitted,
  onAddDate
}: Props): React.JSX.Element | null {
  const [promptsOpen, setPromptsOpen] = useState(false)
  if (!prompts.length && !missing.length) {
    return null
  }
  return (
    <section aria-label="Next steps" className="mb-5 space-y-2">
      {prompts.length > PROMPTS_SHOWN_OPEN ? (
        <Collapsible open={promptsOpen} onOpenChange={setPromptsOpen}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className={cn(
                ROW,
                'w-full text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
              )}
            >
              <Send className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1">
                {prompts.length} tracked conferences closed recently. Did you submit to any?
              </span>
              <ChevronRight
                className={cn(
                  'size-4 shrink-0 text-muted-foreground transition-transform',
                  promptsOpen && 'rotate-90'
                )}
                aria-hidden
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 space-y-2 pl-6">
            {prompts.map((prompt) => (
              <PromptRow
                key={prompt.editionId}
                prompt={prompt}
                saving={saving}
                short
                onMarkSubmitted={onMarkSubmitted}
              />
            ))}
          </CollapsibleContent>
        </Collapsible>
      ) : (
        prompts.map((prompt) => (
          <PromptRow
            key={prompt.editionId}
            prompt={prompt}
            saving={saving}
            short={false}
            onMarkSubmitted={onMarkSubmitted}
          />
        ))
      )}
      {missing.map((milestone) => (
        <div key={milestone.key} className={ROW}>
          <CalendarPlus className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <p className="min-w-0 flex-1">
            <span className="font-medium">{milestone.title}</span> · {milestone.label}
            <span className="block text-xs text-muted-foreground">
              Not in either data source yet. Add it from the call for papers or your email.
            </span>
          </p>
          <Button variant="outline" size="xs" onClick={() => onAddDate(milestone)}>
            Add date
          </Button>
        </div>
      ))}
    </section>
  )
}
