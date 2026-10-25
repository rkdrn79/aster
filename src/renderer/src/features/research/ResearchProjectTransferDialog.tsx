import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { ResearchComputeLink } from '../../../../shared/research/research-compute-links'
import {
  researchProjectTransferRequestSchema,
  type ResearchProjectTransferPreview,
  type ResearchProjectTransferRequest,
  type ResearchProjectTransferResult
} from '../../../../shared/research/research-project-transfer'

function TransferBody({
  link,
  projectName,
  suggestedLocalRoots,
  onClose
}: {
  link: ResearchComputeLink
  projectName: string
  suggestedLocalRoots: string[]
  onClose: () => void
}): React.JSX.Element {
  const [direction, setDirection] = useState<'push' | 'pull'>('push')
  const [localRoot, setLocalRoot] = useState(suggestedLocalRoots[0] ?? '')
  const [pathsText, setPathsText] = useState('')
  const [preview, setPreview] = useState<ResearchProjectTransferPreview | null>(null)
  const [previewKey, setPreviewKey] = useState('')
  const [result, setResult] = useState<ResearchProjectTransferResult | null>(null)
  const [busy, setBusy] = useState<'preview' | 'transfer' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const candidate = {
    linkId: link.id,
    localRoot: localRoot.trim(),
    direction,
    paths: pathsText
      .split(/\r?\n/)
      .map((path) => path.trim())
      .filter(Boolean)
  }
  const parsed = researchProjectTransferRequestSchema.safeParse(candidate)
  const request: ResearchProjectTransferRequest | null = parsed.success ? parsed.data : null
  const requestKey = request ? JSON.stringify(request) : ''
  const currentPreview = preview && previewKey === requestKey ? preview : null

  async function showPreview(): Promise<void> {
    if (!request) {
      return
    }
    setBusy('preview')
    setError(null)
    setResult(null)
    try {
      const next = await window.api.researchCompute.previewTransfer(request)
      setPreview(next)
      setPreviewKey(requestKey)
    } catch (cause) {
      setError(String(cause))
    } finally {
      setBusy(null)
    }
  }

  async function transfer(): Promise<void> {
    if (!request || !currentPreview || busy) {
      return
    }
    setBusy('transfer')
    setError(null)
    try {
      setResult(await window.api.researchCompute.transferProject(request))
      setPreview(null)
    } catch (cause) {
      setError(
        `Transfer did not finish. ${String(cause)} A .partial snapshot may remain at the destination.`
      )
    } finally {
      setBusy(null)
    }
  }

  return (
    <DialogContent className="sm:max-w-2xl" scrollable>
      <DialogHeader>
        <DialogTitle>Transfer project files</DialogTitle>
        <DialogDescription>
          {projectName} · {link.remotePath}. Each transfer is a new snapshot; nothing is
          overwritten.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4 text-xs">
        <ToggleGroup
          type="single"
          variant="segmented"
          size="xs"
          spacing={1}
          value={direction}
          aria-label="Transfer direction"
          onValueChange={(next) => {
            if (next === 'push' || next === 'pull') {
              setDirection(next)
              setResult(null)
            }
          }}
        >
          <ToggleGroupItem value="push">Push to host</ToggleGroupItem>
          <ToggleGroupItem value="pull">Pull from host</ToggleGroupItem>
        </ToggleGroup>
        <label className="block space-y-1 font-medium">
          Local project folder
          <Input
            value={localRoot}
            onChange={(event) => setLocalRoot(event.target.value)}
            placeholder="Choose an open project folder"
            className="mt-1 font-mono"
          />
        </label>
        {suggestedLocalRoots.length > 1 ? (
          <div className="flex flex-wrap gap-1" aria-label="Open local workspaces">
            {suggestedLocalRoots.map((root) => (
              <Button key={root} size="xs" variant="outline" onClick={() => setLocalRoot(root)}>
                {root}
              </Button>
            ))}
          </div>
        ) : null}
        <label className="block space-y-1 font-medium">
          {direction === 'push' ? 'Local paths to push' : 'Host paths to pull'}
          <Textarea
            value={pathsText}
            onChange={(event) => setPathsText(event.target.value)}
            placeholder={'src\nconfigs\nresults/run-001'}
            className="mt-1 min-h-28 font-mono"
          />
        </label>
        <p className="text-muted-foreground">
          One relative file or folder per line. Select only data permitted on the destination.
          Symbolic links, .env files, .git and node_modules are excluded. Limit: 10 GiB and 10,000
          files per transfer.
        </p>
        {!request && pathsText.trim() ? (
          <p role="alert" className="text-destructive">
            {parsed.success ? null : parsed.error.issues[0]?.message}
          </p>
        ) : null}
        {currentPreview ? (
          <div className="space-y-2 rounded-md border border-border p-3" role="status">
            <p className="font-medium">
              {currentPreview.files} files · {(currentPreview.bytes / 1024 / 1024).toFixed(1)} MiB
            </p>
            <p className="break-all text-muted-foreground">
              {currentPreview.sourceRoot} → {currentPreview.destinationRoot}/.aster-
              {direction}-&lt;new snapshot&gt;
            </p>
            <div className="scrollbar-sleek max-h-28 overflow-auto font-mono text-muted-foreground">
              {currentPreview.paths.map((path) => (
                <p key={path}>{path}</p>
              ))}
              {currentPreview.truncated ? <p>…and more</p> : null}
            </div>
            {currentPreview.skippedCount ? (
              <p className="text-muted-foreground">
                {currentPreview.skippedCount} excluded paths: {currentPreview.skipped.join(', ')}
              </p>
            ) : null}
          </div>
        ) : null}
        {result ? (
          <p role="status" className="break-all">
            Snapshot ready: {result.destinationPath} · {result.files} files
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        ) : null}
      </div>
      <DialogFooter>
        <Button variant="ghost" disabled={busy !== null} onClick={onClose}>
          Close
        </Button>
        <Button
          variant="outline"
          disabled={!request || busy !== null}
          onClick={() => void showPreview()}
        >
          {busy === 'preview' ? 'Checking…' : 'Preview'}
        </Button>
        <Button disabled={!currentPreview || busy !== null} onClick={() => void transfer()}>
          {busy === 'transfer'
            ? 'Transferring…'
            : direction === 'push'
              ? 'Push snapshot'
              : 'Pull snapshot'}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}

export function ResearchProjectTransferDialog({
  link,
  projectName,
  suggestedLocalRoots,
  onClose
}: {
  link: ResearchComputeLink | null
  projectName: string
  suggestedLocalRoots: string[]
  onClose: () => void
}): React.JSX.Element {
  return (
    <Dialog open={link !== null} onOpenChange={(next) => !next && onClose()}>
      {link ? (
        <TransferBody
          key={link.id}
          link={link}
          projectName={projectName}
          suggestedLocalRoots={suggestedLocalRoots}
          onClose={onClose}
        />
      ) : null}
    </Dialog>
  )
}
