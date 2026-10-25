import { useEffect, useState } from 'react'
import { createBrowserUuid } from '@/lib/browser-uuid'
import type { ResearchComputeLink } from '../../../../shared/research/research-compute-links'

export type ResearchComputeLinkInput = Pick<
  ResearchComputeLink,
  'targetId' | 'remotePath' | 'projectId' | 'projectName'
>

/** Cluster folders linked to open projects, persisted by main in `research/compute-links.json`. */
export function useResearchComputeLinks(enabled: boolean): {
  links: ResearchComputeLink[]
  error: string | null
  addLink: (input: ResearchComputeLinkInput) => Promise<void>
  removeLink: (link: ResearchComputeLink) => Promise<void>
} {
  const [links, setLinks] = useState<ResearchComputeLink[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) {
      return
    }
    window.api.researchCompute
      .readLinks()
      .then((document) => setLinks(document.links))
      .catch((cause: unknown) => setError(`Linked project folders did not load. ${String(cause)}`))
  }, [enabled])

  async function save(next: ResearchComputeLink[]): Promise<void> {
    const saved = await window.api.researchCompute.saveLinks({ schemaVersion: 1, links: next })
    setLinks(saved.links)
    setError(null)
  }

  return {
    links,
    error,
    // One link per folder: linking it again moves it to the new project.
    addLink: (input) =>
      save([
        ...links.filter(
          (link) => link.targetId !== input.targetId || link.remotePath !== input.remotePath
        ),
        { ...input, id: createBrowserUuid(), createdAt: new Date().toISOString() }
      ]),
    removeLink: (link) =>
      save(links.filter((entry) => entry.id !== link.id)).catch((cause: unknown) =>
        setError(`The link was not removed. ${String(cause)}`)
      )
  }
}
