import { useEffect, useState } from 'react'
import QRCodeBrowser from 'qrcode/lib/browser'
import { Plus, RefreshCw, Send, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import type {
  PaseoCompanionAgent,
  PaseoCompanionProvider,
  PaseoCompanionScope
} from '../../../../shared/research/research-paseo-companion'

export function ResearchPhoneChatsDialog({
  open,
  onClose,
  scope
}: {
  open: boolean
  onClose: () => void
  scope: PaseoCompanionScope
}): React.JSX.Element {
  const [agents, setAgents] = useState<PaseoCompanionAgent[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [log, setLog] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [settingUp, setSettingUp] = useState(false)
  const [sending, setSending] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const [newPrompt, setNewPrompt] = useState('')
  const [providers, setProviders] = useState<PaseoCompanionProvider[]>([])
  const [provider, setProvider] = useState('')
  const [providerLoading, setProviderLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refresh, setRefresh] = useState(0)
  const [pairing, setPairing] = useState(false)
  const [pairingQr, setPairingQr] = useState<{ scopeKey: string; dataUrl: string } | null>(null)
  const { hostId, workspaceId, workspacePath } = scope
  const scopeKey = `${hostId}\n${workspaceId}\n${workspacePath}`
  const visiblePairingQr = open && pairingQr?.scopeKey === scopeKey ? pairingQr.dataUrl : null

  useEffect(() => {
    if (!open) {
      return
    }
    let live = true
    setLoading(true)
    setError(null)
    const currentScope = { hostId, workspaceId, workspacePath }
    void (async () => {
      try {
        let next: PaseoCompanionAgent[]
        try {
          next = await window.api.researchPaseo.list(currentScope)
        } catch (cause) {
          if (hostId === 'local' || !String(cause).includes('Paseo is not installed')) {
            throw cause
          }
          if (live) {
            setSettingUp(true)
          }
          await window.api.researchPaseo.setup(currentScope)
          next = await window.api.researchPaseo.list(currentScope)
        }
        if (live) {
          setAgents(next)
          setSelectedId((current) =>
            next.some((agent) => agent.id === current) ? current : (next[0]?.id ?? null)
          )
        }
      } catch (cause) {
        if (live) {
          setAgents([])
          setSelectedId(null)
          setError(String(cause))
        }
      } finally {
        if (live) {
          setLoading(false)
          setSettingUp(false)
        }
      }
    })()
    return () => {
      live = false
    }
  }, [open, hostId, workspaceId, workspacePath, refresh])

  useEffect(() => {
    if (!open || !selectedId) {
      setLog('')
      return
    }
    let live = true
    setLog('')
    void window.api.researchPaseo.logs({ hostId, workspaceId, workspacePath }, selectedId).then(
      (next) => {
        if (live) {
          setLog(next)
        }
      },
      (cause) => {
        if (live) {
          setLog(`Recent activity unavailable: ${String(cause)}`)
        }
      }
    )
    return () => {
      live = false
    }
  }, [open, hostId, workspaceId, workspacePath, selectedId, refresh])

  useEffect(() => {
    if (!open || !newOpen) {
      return
    }
    let live = true
    setProviderLoading(true)
    void Promise.all([
      window.api.researchPaseo.providers({ hostId, workspaceId, workspacePath }),
      window.api.settings.get()
    ])
      .then(
        ([available, settings]) => {
          if (live) {
            setProviders(available)
            setProvider((current) =>
              available.some((entry) => entry.id === current)
                ? current
                : (available.find((entry) => entry.id === settings.defaultTuiAgent)?.id ??
                  available[0]?.id ??
                  '')
            )
          }
        },
        (cause) => {
          if (live) {
            setError(String(cause))
          }
        }
      )
      .finally(() => {
        if (live) {
          setProviderLoading(false)
        }
      })
    return () => {
      live = false
    }
  }, [open, newOpen, hostId, workspaceId, workspacePath])

  async function send(): Promise<void> {
    if (!selectedId || !message.trim() || sending) {
      return
    }
    setSending(true)
    setError(null)
    try {
      await window.api.researchPaseo.send(scope, selectedId, message)
      setMessage('')
      setRefresh((value) => value + 1)
    } catch (cause) {
      setError(String(cause))
    } finally {
      setSending(false)
    }
  }

  async function pairPhone(): Promise<void> {
    if (pairing) {
      return
    }
    setPairing(true)
    setPairingQr(null)
    setError(null)
    try {
      const url = await window.api.researchPaseo.pair(scope)
      const qr = await QRCodeBrowser.toDataURL(url, {
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 232
      })
      setPairingQr({ scopeKey, dataUrl: qr })
    } catch (cause) {
      setError(String(cause))
    } finally {
      setPairing(false)
    }
  }

  async function startPhoneChat(): Promise<void> {
    if (!newPrompt.trim() || !provider || creating) {
      return
    }
    setCreating(true)
    setError(null)
    try {
      const agentId = await window.api.researchPaseo.start(scope, newPrompt, provider)
      setNewPrompt('')
      setNewOpen(false)
      setSelectedId(agentId)
      setRefresh((value) => value + 1)
    } catch (cause) {
      setError(String(cause))
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-3xl" scrollable>
        <DialogHeader>
          <DialogTitle>Phone chats</DialogTitle>
          <DialogDescription>
            Paseo conversations in this project are shared with the Paseo phone app when that phone
            is paired to the same daemon. Aster conversations remain separate. On first use, Aster
            sets up Paseo on supported SSH hosts.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">
            Pair this project’s host in the Paseo iPhone app to use its conversations away from your
            computer.
          </span>
          <Button size="sm" variant="outline" disabled={pairing} onClick={() => void pairPhone()}>
            <Smartphone aria-hidden /> {pairing ? 'Preparing…' : 'Pair phone'}
          </Button>
        </div>
        {visiblePairingQr ? (
          <div className="flex flex-col items-center gap-2 rounded-md border border-border p-3 text-center">
            <img
              src={visiblePairingQr}
              alt="Paseo phone pairing QR code"
              width={232}
              height={232}
            />
            <p className="text-xs text-muted-foreground">
              Scan with the Paseo app. Keep this code private and refresh it if pairing fails.
            </p>
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="truncate" title={scope.workspacePath}>
            {scope.workspacePath}
          </span>
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label="Refresh phone chats"
            onClick={() => setRefresh((value) => value + 1)}
          >
            <RefreshCw aria-hidden />
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            New phone chats use this project folder and an available agent on its host.
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={loading}
            onClick={() => setNewOpen((value) => !value)}
          >
            <Plus aria-hidden /> New phone chat
          </Button>
        </div>
        {newOpen ? (
          <div className="flex flex-col gap-2 rounded-md border border-border p-3">
            <Select
              value={provider}
              onValueChange={setProvider}
              disabled={providerLoading || creating}
            >
              <SelectTrigger size="sm" aria-label="Phone agent provider" className="w-full">
                <SelectValue
                  placeholder={providerLoading ? 'Checking agents…' : 'Choose an agent'}
                />
              </SelectTrigger>
              <SelectContent>
                {providers.map((entry) => (
                  <SelectItem key={entry.id} value={entry.id}>
                    {entry.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!providerLoading && providers.length === 0 ? (
              <p className="text-xs text-muted-foreground">No available agent on this host.</p>
            ) : null}
            <Textarea
              aria-label="First message to new phone conversation"
              value={newPrompt}
              onChange={(event) => setNewPrompt(event.target.value)}
              placeholder="What should this agent work on?"
              rows={3}
              maxLength={20_000}
              disabled={creating}
            />
            <Button
              size="sm"
              className="self-end"
              disabled={!newPrompt.trim() || !provider || providerLoading || creating}
              onClick={() => void startPhoneChat()}
            >
              {creating ? 'Starting…' : 'Start conversation'}
            </Button>
          </div>
        ) : null}
        {error ? (
          <div role="alert" className="flex items-center gap-2 text-xs text-destructive">
            <span className="min-w-0 flex-1">{error}</span>
            {error.includes('Paseo') || error.includes('npm') ? (
              <Button
                size="xs"
                variant="link"
                onClick={() => void window.api.shell.openUrl('https://paseo.sh/docs')}
              >
                Setup guide
              </Button>
            ) : null}
          </div>
        ) : null}
        <div className="grid min-h-64 gap-3 sm:grid-cols-[13rem_minmax(0,1fr)]">
          <div
            className="scrollbar-sleek max-h-80 space-y-1 overflow-auto rounded-md border border-border p-1"
            aria-label="Phone agents"
          >
            {loading ? (
              <p className="p-2 text-xs text-muted-foreground">
                {settingUp ? 'Setting up Paseo on this host…' : 'Connecting…'}
              </p>
            ) : null}
            {!loading && agents.length === 0 ? (
              <p className="p-2 text-xs text-muted-foreground">
                No Paseo conversations in this project. Start one in the Paseo app, then refresh.
              </p>
            ) : null}
            {agents.map((agent) => (
              <Button
                key={agent.id}
                size="sm"
                variant={selectedId === agent.id ? 'secondary' : 'ghost'}
                className="h-auto w-full min-w-0 justify-start text-left"
                onClick={() => setSelectedId(agent.id)}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{agent.name}</span>
                  <span className="block truncate text-2xs text-muted-foreground">
                    {agent.status} · {agent.provider}
                  </span>
                </span>
              </Button>
            ))}
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <pre className="scrollbar-sleek min-h-44 max-h-64 flex-1 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/30 p-3 text-xs">
              {log || (selectedId ? 'Loading recent activity…' : 'Select a conversation.')}
            </pre>
            <Textarea
              aria-label="Message to phone conversation"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Message this Paseo agent…"
              rows={3}
              maxLength={20_000}
              disabled={!selectedId || sending}
            />
            <Button
              size="sm"
              className="self-end"
              disabled={!selectedId || !message.trim() || sending}
              onClick={() => void send()}
            >
              <Send aria-hidden /> {sending ? 'Sending…' : 'Send'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
