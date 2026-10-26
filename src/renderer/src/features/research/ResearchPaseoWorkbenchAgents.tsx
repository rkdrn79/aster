import { useEffect, useState } from 'react'
import { MessageSquareText, RefreshCw, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type {
  PaseoCompanionAgent,
  PaseoCompanionScope
} from '../../../../shared/research/research-paseo-companion'
import { ResearchPhoneChatsDialog } from './ResearchPhoneChatsDialog'

/** Paseo owns these agent IDs; the same conversations are available in its phone app. */
export function ResearchPaseoWorkbenchAgents({
  scope,
  hostLabel,
  active
}: {
  scope: PaseoCompanionScope
  hostLabel: string | null
  active: boolean
}): React.JSX.Element | null {
  const [agents, setAgents] = useState<PaseoCompanionAgent[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refresh, setRefresh] = useState(0)
  const { hostId, workspaceId, workspacePath } = scope

  useEffect(() => {
    if (!active || !window.api?.researchPaseo?.listHost) {
      return
    }
    let live = true
    let pending = false
    const currentScope = { hostId, workspaceId, workspacePath }
    async function load(): Promise<void> {
      if (pending) {
        return
      }
      pending = true
      try {
        const next = await window.api.researchPaseo.listHost(currentScope)
        if (live) {
          setAgents(next)
          setError(null)
        }
      } catch (cause) {
        if (live) {
          setAgents([])
          setError(String(cause))
        }
      } finally {
        pending = false
      }
    }
    void load()
    const interval = window.setInterval(() => void load(), 15_000)
    return () => {
      live = false
      window.clearInterval(interval)
    }
  }, [active, hostId, workspaceId, workspacePath, refresh])

  if (!active || !window.api?.researchPaseo?.listHost) {
    return null
  }

  return (
    <div className="space-y-1" aria-label="Paseo agents on this host">
      <div className="flex min-w-0 items-center gap-1">
        <span
          className="min-w-0 flex-1 truncate px-2 text-2xs font-semibold text-muted-foreground"
          title={`Paseo agents on ${hostLabel ?? hostId}`}
        >
          Paseo · {hostLabel ?? hostId}
        </span>
        <span
          className="text-2xs tabular-nums text-muted-foreground"
          aria-label={`${agents.length} Paseo agents`}
        >
          {agents.length}
        </span>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="Refresh Paseo agents"
          title="Refresh Paseo agents"
          onClick={() => setRefresh((value) => value + 1)}
        >
          <RefreshCw aria-hidden />
        </Button>
      </div>
      {error ? (
        <p className="px-2 text-2xs text-muted-foreground" role="status">
          Paseo agents unavailable on this host. Refresh to retry.
        </p>
      ) : null}
      {agents.map((agent) => (
        <Button
          key={agent.id}
          size="sm"
          variant="ghost"
          className="h-auto w-full min-w-0 justify-start py-1 text-left"
          title={`${agent.name} · ${agent.cwd} · ${agent.id}`}
          onClick={() => setSelectedId(agent.id)}
        >
          <MessageSquareText className="size-4 shrink-0" aria-hidden />
          <span className="flex min-w-0 flex-col items-start">
            <span className="max-w-full truncate">{agent.name}</span>
            <span className="max-w-full truncate text-2xs text-muted-foreground">
              {agent.status} · {agent.provider}
            </span>
          </span>
        </Button>
      ))}
      {agents.length === 0 && !error ? (
        <p className="px-2 text-2xs text-muted-foreground">No Paseo agents on this host.</p>
      ) : null}
      <Button
        size="xs"
        variant="ghost"
        className="w-full justify-start text-muted-foreground"
        onClick={() => setSelectedId(agents[0]?.id ?? '')}
      >
        <Smartphone aria-hidden /> Phone chats…
      </Button>
      {selectedId !== null ? (
        <ResearchPhoneChatsDialog
          key={`${hostId}:${selectedId}`}
          open
          onClose={() => {
            setSelectedId(null)
            setRefresh((value) => value + 1)
          }}
          scope={scope}
          allHost
          initialAgentId={selectedId || null}
        />
      ) : null}
    </div>
  )
}
