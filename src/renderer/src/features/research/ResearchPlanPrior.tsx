import { ExternalLink } from 'lucide-react'
import type { PlanClosestPrior } from '../../../../research-harness/research-plan-view.mjs'
import { TAG_CHIP } from './research-surface-classes'
import { PlanSection } from './ResearchPlanSection'

function paperUrl(entry: PlanClosestPrior): string | null {
  if (entry.arxiv) {
    return `https://arxiv.org/abs/${entry.arxiv}`
  }
  return entry.doi ? `https://doi.org/${entry.doi}` : null
}

function PriorRow({ entry }: { entry: PlanClosestPrior }): React.JSX.Element {
  const url = paperUrl(entry)
  const id = entry.arxiv ? `arXiv ${entry.arxiv}` : entry.doi ? `DOI ${entry.doi}` : null
  return (
    <li className="py-2">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-xs font-medium">{entry.method ?? entry.title}</span>
        {entry.baseline ? (
          <span className={TAG_CHIP}>
            Baseline {entry.baseline}
            {entry.baselineName && entry.baselineName !== entry.method
              ? ` · ${entry.baselineName}`
              : ''}
          </span>
        ) : (
          <span className="text-2xs text-status-warning">Not compared</span>
        )}
      </div>
      <p className="mt-0.5 text-2xs text-muted-foreground">
        {entry.method ? `${entry.title} · ` : ''}
        {entry.year ? `${entry.year} · ` : ''}
        {url && id ? (
          <button
            type="button"
            className="inline-flex items-center gap-1 underline-offset-2 hover:text-foreground hover:underline"
            onClick={() => void window.api.shell.openUrl(url)}
          >
            {id}
            <ExternalLink className="size-3" aria-hidden />
          </button>
        ) : (
          'No arXiv id or DOI'
        )}
      </p>
      {entry.baseline ? null : entry.reason ? (
        <p className="mt-0.5 text-2xs text-muted-foreground">Why not: {entry.reason}</p>
      ) : null}
    </li>
  )
}

/** The closest prior methods the agent searched for before planning, and how each is handled. */
export function ResearchPlanPrior({
  entries
}: {
  entries: readonly PlanClosestPrior[]
}): React.JSX.Element {
  const compared = entries.filter((entry) => entry.baseline).length
  return (
    <PlanSection
      title="Closest prior methods"
      hint={
        entries.length
          ? `Reviewers ask for these comparisons most. ${compared} of ${entries.length} ${entries.length === 1 ? 'is' : 'are'} compared; the rest say why not.`
          : 'The agent recorded none. Ask it to search for the closest prior methods before you approve.'
      }
    >
      {entries.length ? (
        <ul className="divide-y divide-border/40">
          {entries.map((entry) => (
            <PriorRow key={`${entry.arxiv ?? entry.doi ?? entry.title}`} entry={entry} />
          ))}
        </ul>
      ) : null}
    </PlanSection>
  )
}
