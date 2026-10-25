import { useState } from 'react'
import {
  Bug,
  ChartLine,
  Ellipsis,
  ListChecks,
  MessageSquareText,
  PencilRuler,
  StepForward,
  type LucideIcon
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { ExperimentRecord } from '../../../../shared/research/research-records'
import { ResearchAgentChatPane } from './ResearchAgentChatPane'
import { LOCAL_CATALOG_ONLY, type AgentReviewOutcome } from './research-agent-review-launch'
import type { AgentReviewSetup, AgentReviewTarget } from './research-agent-review-prompt'
import {
  askExperimentAgent,
  askExperimentChat,
  bindExperimentAgentSession,
  EXPERIMENT_CHAT_QUICK_PROMPTS,
  experimentChatPrompt,
  experimentChatScope,
  launchExperimentAgent,
  type ExperimentChatRequest
} from './research-experiment-agent-chat'
import { researchErrorText } from './research-error-text'

/** Runs one send at a time and reports a refused one as a toast. */
function useAgentSend(): {
  busy: boolean
  run: (task: () => Promise<AgentReviewOutcome>, onSent?: () => void) => void
} {
  const [busy, setBusy] = useState(false)
  return {
    busy,
    run: (task, onSent) => {
      if (busy) {
        return
      }
      setBusy(true)
      void task()
        .then((outcome) => {
          if (!outcome.ok) {
            toast.error(outcome.message)
          } else {
            onSent?.()
          }
        })
        .catch((cause: unknown) => toast.error(researchErrorText(cause)))
        .finally(() => setBusy(false))
    }
  }
}

const QUICK_PROMPT_ICONS: Record<ExperimentChatRequest, LucideIcon> = {
  design: PencilRuler,
  analyze: ChartLine,
  'explain-failure': Bug,
  'next-run': StepForward,
  'full-review': ListChecks,
  'draft-conclusion': ListChecks
}
// Why: the docked pane is about 384px wide; the rest fold into a menu until the row has room.
const INLINE_QUICK_PROMPTS = 3

function QuickPrompts({ experiment }: { experiment: ExperimentRecord }): React.JSX.Element {
  const scope = experimentChatScope(experiment)
  const { busy, run } = useAgentSend()
  const ask = (request: ExperimentChatRequest): void =>
    run(() => askExperimentChat(experiment, (setup) => experimentChatPrompt(request, setup)))
  const disabled = !scope || busy
  const overflow = EXPERIMENT_CHAT_QUICK_PROMPTS.slice(INLINE_QUICK_PROMPTS)
  return (
    <div
      role="group"
      aria-label="Ask the experiment agent"
      title={scope ? undefined : LOCAL_CATALOG_ONLY}
      className="@container flex shrink-0 items-center gap-1.5 overflow-hidden border-b border-border px-3 py-2"
    >
      {EXPERIMENT_CHAT_QUICK_PROMPTS.map(({ label, request }, index) => {
        const Icon = QUICK_PROMPT_ICONS[request]
        return (
          <Button
            key={request}
            size="xs"
            variant="outline"
            disabled={disabled}
            className={cn('shrink-0', index >= INLINE_QUICK_PROMPTS && 'hidden @lg:inline-flex')}
            onClick={() => ask(request)}
          >
            <Icon aria-hidden />
            {label}
          </Button>
        )
      })}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon-xs"
            variant="ghost"
            disabled={disabled}
            aria-label="More requests"
            className="shrink-0 @lg:hidden"
          >
            <Ellipsis aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {overflow.map(({ label, request }) => {
            const Icon = QUICK_PROMPT_ICONS[request]
            return (
              <DropdownMenuItem key={request} onSelect={() => ask(request)}>
                <Icon aria-hidden />
                {label}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

/** The Experiment's own agent chat, docked beside its notebook: it designs and analyzes. */
export function ResearchExperimentAgentPane({
  experiment,
  visible,
  className
}: {
  experiment: ExperimentRecord
  visible: boolean
  className?: string
}): React.JSX.Element {
  return (
    <ResearchAgentChatPane
      workspaceId={experiment.workspaceId}
      hostId={experiment.hostId}
      boundSessionId={experiment.experimentAgentSessionId}
      home={{ kind: 'experiment', experimentId: experiment.id }}
      title="Experiment agent"
      sessionLabel="Experiment agent session"
      emptyHint="Design this experiment and analyze its results with an agent. It proposes Runs for your approval, records its analyses in the notebook, and leaves code changes to Workbench. Start a chat below, or pick a request above to start one with it."
      visible={visible}
      className={className}
      toolbar={<QuickPrompts experiment={experiment} />}
      onBind={(sessionId) => bindExperimentAgentSession(experiment, sessionId)}
      onLaunch={(agent) => launchExperimentAgent(experiment, agent)}
    />
  )
}

/** A notebook button that sends one request to the Experiment's docked chat. */
export function ResearchExperimentChatButton({
  experiment,
  build,
  variant = 'ghost',
  onSent,
  children
}: {
  experiment: ExperimentRecord
  build: (setup: AgentReviewSetup) => string
  variant?: 'default' | 'outline' | 'ghost'
  /** After the request reached the chat, for an inline acknowledgement. */
  onSent?: () => void
  children: React.ReactNode
}): React.JSX.Element {
  const { busy, run } = useAgentSend()
  return (
    <Button
      size="xs"
      variant={variant}
      disabled={busy || !experimentChatScope(experiment)}
      onClick={() => run(() => askExperimentChat(experiment, build), onSent)}
    >
      {children}
    </Button>
  )
}

/** "Ask agent": sends a triage to the Experiment's docked chat. */
export function ResearchAskExperimentAgent({
  experiment,
  target,
  label = 'Ask agent',
  onSent
}: {
  experiment: ExperimentRecord
  target: AgentReviewTarget
  label?: string
  /** After the request reached the chat, for an inline acknowledgement. */
  onSent?: () => void
}): React.JSX.Element {
  const { busy, run } = useAgentSend()
  return (
    <Button
      size="xs"
      variant="ghost"
      disabled={busy}
      onClick={() => run(() => askExperimentAgent(experiment, target), onSent)}
    >
      <MessageSquareText aria-hidden />
      {label}
    </Button>
  )
}
