import { ArrowLeftRight, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ResearchComputeLink } from '../../../../shared/research/research-compute-links'

export function ResearchComputeLinkList({
  links,
  hostLabel,
  projectName,
  onAdd,
  onTransfer,
  onRemove
}: {
  links: readonly ResearchComputeLink[]
  hostLabel: (targetId: string) => string
  projectName: (link: ResearchComputeLink) => string
  onAdd: () => void
  onTransfer: (link: ResearchComputeLink) => void
  onRemove: (link: ResearchComputeLink) => void
}): React.JSX.Element {
  return (
    <section className="space-y-2" aria-label="Linked project folders">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-2xs font-semibold uppercase tracking-widest text-muted-foreground">
          Linked project folders
        </h2>
        <Button variant="ghost" size="xs" onClick={onAdd}>
          <Plus aria-hidden />
          Link a folder
        </Button>
      </div>
      {links.length ? (
        <ul className="divide-y divide-border rounded-lg border border-border text-xs">
          {links.map((link) => (
            <li key={link.id} className="flex items-center gap-3 px-4 py-2">
              <span className="w-40 shrink-0 truncate font-medium">{projectName(link)}</span>
              <span className="w-28 shrink-0 truncate text-muted-foreground">
                {hostLabel(link.targetId)}
              </span>
              <span
                className="min-w-0 flex-1 truncate font-mono text-muted-foreground"
                title={link.remotePath}
              >
                {link.remotePath}
              </span>
              <Button variant="outline" size="xs" onClick={() => onTransfer(link)}>
                <ArrowLeftRight aria-hidden />
                Transfer
              </Button>
              <Button variant="ghost" size="xs" onClick={() => onRemove(link)}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          Link a cluster folder to one of your open projects so its jobs show here.
        </p>
      )}
    </section>
  )
}
