import { listFigureHistory } from './research-figure-history'
import type { ProjectFileOwner } from './research-project-files'

/** The figure with the latest agent turn (a "before send" or "agent result" version), or null. */
export async function lastAgentTurnFigure(
  owner: ProjectFileOwner,
  slugs: readonly string[]
): Promise<string | null> {
  const latest = await Promise.all(
    slugs.map(async (slug) => {
      const entries = await listFigureHistory(owner, slug).catch(() => [])
      const entry = entries.find(
        (item) => item.kind === 'before-send' || item.kind === 'agent-result'
      )
      return entry ? { slug, at: entry.at } : null
    })
  )
  return (
    latest.filter((entry) => entry !== null).sort((a, b) => b.at.localeCompare(a.at))[0]?.slug ??
    null
  )
}
