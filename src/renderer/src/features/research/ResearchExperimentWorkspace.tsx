import { useState } from 'react'
import { FlaskConical, FolderSync, MessageSquareText, MoreHorizontal, Plus } from 'lucide-react'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { ResearchEmptyState, ResearchPageBody, ResearchPageHeader } from './ResearchPageLayout'
import { BRIEF_STATUS_LABELS, briefIsEmpty } from './research-experiment-brief-form'
import {
  useExperimentWorkspace,
  type ExperimentWorkspace
} from './research-experiment-workspace-state'
import { ResearchExperimentAgentPane } from './ResearchExperimentAgentPane'
import { useExperimentChatPanel } from './research-experiment-agent-chat'
import { ResearchExperimentDetails } from './ResearchExperimentDetails'
import { ResearchExperimentNotebook } from './ResearchExperimentNotebook'
import { ResearchExperimentAgentSplit } from './ResearchExperimentAgentSplit'
import { ResearchExperimentPageTabs } from './ResearchExperimentPageTabs'
import { experimentPage } from './research-experiment-page'
import { useResearchExperimentPageShortcut } from './use-research-experiment-page-shortcut'

function StatusChip({ workspace }: { workspace: ExperimentWorkspace }): React.JSX.Element | null {
  const brief = workspace.brief.brief
  if (!brief || briefIsEmpty(brief)) {
    return null
  }
  return (
    <Badge variant="outline" className="align-middle">
      {brief.status === 'running' ? (
        <span aria-hidden className="size-1.5 rounded-full bg-status-success" />
      ) : null}
      {BRIEF_STATUS_LABELS[brief.status]}
    </Badge>
  )
}

/** Attach run and Organize results now: rarely needed, so behind the header's overflow. */
function MoreActions({ workspace }: { workspace: ExperimentWorkspace }): React.JSX.Element {
  const [organizing, setOrganizing] = useState(false)
  const { organize } = workspace
  async function runOrganize(): Promise<void> {
    if (!organize || organizing) {
      return
    }
    setOrganizing(true)
    try {
      await organize()
    } finally {
      setOrganizing(false)
    }
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="More experiment actions"
          title="More experiment actions"
          aria-busy={organizing || undefined}
        >
          {organizing ? <LoadingSpinner className="size-4" /> : <MoreHorizontal aria-hidden />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onSelect={workspace.openAttach}>
          <Plus aria-hidden />
          Attach run
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!organize || organizing} onSelect={() => void runOrganize()}>
          <FolderSync aria-hidden />
          Organize results now
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * One screen per Experiment (ADR-003): its notebook in the middle, its agent docked beside it, and
 * Runs, Compare, and Outputs as Details one tab away. The Runs and Compare views both render it.
 */
export function ResearchExperimentWorkspace({
  pageTab
}: {
  /** The view that opened the screen: Compare starts on Compare, Runs on the notebook. */
  pageTab: 'runs' | 'compare'
}): React.JSX.Element {
  const workspace = useExperimentWorkspace(pageTab)
  const { experiment, page } = workspace
  const chatOpen = useExperimentChatPanel((state) =>
    experiment ? !state.closedIds[experiment.id] : false
  )
  const setChatOpen = useExperimentChatPanel((state) => state.setOpen)
  useResearchExperimentPageShortcut(experiment ? workspace.togglePage : null)
  return (
    <section
      className="flex min-h-0 flex-1 flex-col bg-background text-foreground"
      aria-label="Experiment"
    >
      <Tabs
        value={page}
        onValueChange={(value) => {
          const next = experimentPage(value)
          if (next) {
            workspace.setPage(next)
          }
        }}
        className="contents"
      >
        <ResearchPageHeader
          title={experiment?.name ?? 'Experiment'}
          context={
            experiment ? (
              <span className="inline-flex items-center gap-2">
                <StatusChip workspace={workspace} />
                {workspace.remoteHost}
              </span>
            ) : undefined
          }
          actions={
            experiment ? (
              <>
                <ResearchExperimentPageTabs />
                <Button
                  variant={chatOpen ? 'secondary' : 'ghost'}
                  size="sm"
                  aria-pressed={chatOpen}
                  onClick={() => setChatOpen(experiment.id, !chatOpen)}
                >
                  <MessageSquareText aria-hidden />
                  Chat
                </Button>
                <MoreActions workspace={workspace} />
              </>
            ) : undefined
          }
        />
        {experiment ? (
          <ResearchExperimentAgentSplit
            chatOpen={chatOpen}
            main={
              <>
                {/* Why: kept mounted so a trip to Details keeps the notebook's scroll and drafts. */}
                <TabsContent
                  value="notebook"
                  forceMount
                  className="flex min-h-0 flex-col data-[state=inactive]:hidden"
                >
                  <ResearchExperimentNotebook workspace={workspace} />
                </TabsContent>
                <ResearchExperimentDetails workspace={workspace} />
              </>
            }
            pane={
              <ResearchExperimentAgentPane
                key={experiment.id}
                experiment={experiment}
                visible={chatOpen}
                className="flex-1"
              />
            }
          />
        ) : (
          <ResearchPageBody>
            <ResearchEmptyState icon={FlaskConical} title="No experiment selected">
              Choose an experiment in the sidebar.
            </ResearchEmptyState>
          </ResearchPageBody>
        )}
      </Tabs>
    </section>
  )
}
