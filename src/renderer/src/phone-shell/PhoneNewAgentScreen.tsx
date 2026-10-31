import { useState } from 'react'
import { FolderPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useAgentMenuObservation } from '@/components/tab-bar/use-new-tab-agent-menu-rows'
import { rowId } from '@/components/tab-bar/tab-agent-row-presentation'
import { useAgentDetectionTargetForWorktree } from '@/hooks/useAgentDetectionTarget'
import {
  canCreateResearchWorktree,
  openResearchNewWorktree
} from '@/features/research/research-new-worktree'
import { useAppStore } from '@/store'
import { formatAgentTypeLabel } from '../../../shared/agent-type-label'
import { launchPhoneAgent } from './phone-agent-launch'
import { selectPhoneScreen, usePhoneNavigation } from './phone-navigation-store'
import { startPhoneTerminal } from './phone-workspace-actions'
import { PHONE_TERMINAL_CHOICE, PhoneAgentChoiceList } from './PhoneAgentChoiceList'
import { PhoneRow, PhoneScrollBody, PhoneSection } from './PhoneListLayout'
import { phoneWorkspaceLabel, usePhoneProjects } from './use-phone-projects'

/** Pick a workspace and an agent the host can run, optionally a first message, then start. */
export function PhoneNewAgentScreen({
  initialWorktreeId
}: {
  initialWorktreeId: string | null
}): React.JSX.Element {
  const { projects, byWorkspaceId } = usePhoneProjects()
  const activeWorktreeId = useAppStore((state) => state.activeWorktreeId)
  const repos = useAppStore((state) => state.repos)
  const settings = useAppStore((state) => state.settings)
  const [chosenWorktreeId, setChosenWorktreeId] = useState<string | null>(null)
  const [chosenAgent, setChosenAgent] = useState<string | null>(null)
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const worktreeId =
    [chosenWorktreeId, initialWorktreeId, activeWorktreeId].find(
      (id) => id && byWorkspaceId.has(id)
    ) ??
    projects[0]?.workspaces[0]?.id ??
    null
  const entry = worktreeId ? byWorkspaceId.get(worktreeId) : undefined
  const detectionTarget = useAgentDetectionTargetForWorktree(worktreeId)
  const { model: menu } = useAgentMenuObservation(worktreeId, Boolean(worktreeId), detectionTarget)
  const launchable =
    menu.state === 'settled' ? menu.rows.filter((row) => row.kind !== 'chat-unavailable') : []
  const selected = chosenAgent ?? (launchable[0] ? rowId(launchable[0]) : PHONE_TERMINAL_CHOICE)
  const row = launchable.find((candidate) => rowId(candidate) === selected)
  const isShell = selected === PHONE_TERMINAL_CHOICE

  async function start(): Promise<void> {
    if (!entry || busy || (!isShell && !row)) {
      return
    }
    const subtitle = phoneWorkspaceLabel(entry)
    if (isShell || !row) {
      await startPhoneTerminal(entry.workspace, subtitle, { replaceScreen: true })
      return
    }
    setBusy(true)
    setError(null)
    const outcome = await launchPhoneAgent({ row, worktreeId: entry.workspace.id, prompt })
    setBusy(false)
    if (outcome.status === 'failed') {
      setError(outcome.message)
      return
    }
    const navigation = usePhoneNavigation.getState()
    // Why: the user may have left this form while the host answered; the session is listed anyway.
    if (selectPhoneScreen(navigation)?.kind !== 'new-agent') {
      return
    }
    navigation.replace({
      kind: 'workbench',
      target: outcome.tabId
        ? {
            kind: 'session',
            worktreeId: entry.workspace.id,
            executionHostId: entry.workspace.executionHostId,
            tabId: outcome.tabId,
            leafId: null
          }
        : { kind: 'workspace', worktreeId: entry.workspace.id },
      title: formatAgentTypeLabel(row.agent),
      subtitle
    })
  }

  const canBranch = entry ? canCreateResearchWorktree({ repos, settings }, entry.workspace) : false
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PhoneScrollBody>
        {/* Why at the top and scrolled to: it is the one place a failed start is explained. */}
        {error ? (
          <div
            ref={(node) => node?.scrollIntoView({ block: 'nearest' })}
            role="alert"
            className="mx-4 mt-5 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3"
          >
            <p className="text-[15px] font-medium text-destructive">Couldn’t start the agent</p>
            <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{error}</p>
          </div>
        ) : null}
        <PhoneSection label="Workspace">
          <div className="p-3">
            <Select
              value={worktreeId ?? ''}
              onValueChange={(id) => {
                setChosenWorktreeId(id)
                setChosenAgent(null)
                setError(null)
              }}
            >
              <SelectTrigger className="w-full" aria-label="Workspace">
                <SelectValue placeholder="Choose a workspace" />
              </SelectTrigger>
              <SelectContent>
                {projects.flatMap((project) =>
                  project.workspaces.map((workspace) => (
                    <SelectItem key={workspace.id} value={workspace.id}>
                      {phoneWorkspaceLabel({ project, workspace })}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          {entry && canBranch ? (
            <PhoneRow
              leading={<FolderPlus className="size-[18px]" aria-hidden />}
              title="New workspace…"
              subtitle={`A new worktree of ${entry.project.name}`}
              onClick={() => openResearchNewWorktree(entry.workspace)}
            />
          ) : null}
        </PhoneSection>
        <PhoneAgentChoiceList
          menu={worktreeId ? menu : null}
          selected={selected}
          onSelect={(key) => {
            setChosenAgent(key)
            setError(null)
          }}
        />
        {isShell ? null : (
          <PhoneSection label="First message (optional)">
            <div className="p-3">
              <Textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="What should the agent do?"
                aria-label="First message"
                rows={3}
                className="min-h-24"
              />
            </div>
          </PhoneSection>
        )}
      </PhoneScrollBody>
      <div className="shrink-0 border-t border-border bg-background px-4 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
        <Button
          size="lg"
          className="w-full"
          disabled={!entry || busy || (!isShell && !row)}
          onClick={() => void start()}
        >
          {busy ? 'Starting…' : isShell ? 'Open terminal' : 'Start agent'}
        </Button>
      </div>
    </div>
  )
}
